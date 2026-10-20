const { tx } = require('../db');
const { HttpError } = require('./http');
const { initialsFrom, colorFor } = require('./users');
const { directoryTokens } = require('./entra');

const SELECT = 'id,displayName,mail,userPrincipalName,department,onPremisesSamAccountName';
const FILTER = "accountEnabled eq true and userType eq 'Member'";

async function listMembers(token) {
  const people = [];
  let url = `https://graph.microsoft.com/v1.0/users?$count=true&$filter=${encodeURIComponent(FILTER)}&$select=${SELECT}&$top=999`;
  for (let page = 0; page < 200 && url; page++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new HttpError(502, 'Não foi possível ler o diretório Microsoft.');
    }
    if (!res.ok) throw new HttpError(502, 'Não foi possível ler o diretório Microsoft.');
    const json = await res.json();
    people.push(...(json.value || []));
    url = json['@odata.nextLink'] || '';
  }
  return people;
}

function usernameFrom(person) {
  const sam = String(person.onPremisesSamAccountName || '').trim().toLowerCase();
  const upn = String(person.userPrincipalName || '').trim().toLowerCase();
  const local = upn.split('@')[0] || '';
  let base = (sam || local).replace(/[^a-z0-9._-]/g, '').slice(0, 80);
  if (base.length < 3) base = `u${String(person.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`;
  return base.slice(0, 80);
}

async function uniqueUsername(client, base, exceptId) {
  let candidate = base.slice(0, 80);
  for (let n = 0; n < 50; n++) {
    const { rows } = await client.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [candidate, exceptId]
    );
    if (!rows.length) return candidate;
    const suffix = `-${n + 1}`;
    candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
  }
  throw new HttpError(409, 'Não foi possível gerar um usuário único para uma conta do diretório.');
}

function identityOf(person) {
  const email = String(person.mail || person.userPrincipalName || '').trim().toLowerCase().slice(0, 150);
  const name = String(person.displayName || '').trim().slice(0, 100) || email.split('@')[0];
  const department = String(person.department || '').trim().slice(0, 200);
  return { email, name, department };
}

async function applyPerson(client, person, blocked) {
  const oid = String(person.id || '');
  if (blocked.has(oid)) return 'skipped';
  const { email, name, department } = identityOf(person);
  const desired = usernameFrom(person);
  if (!oid || !email || name.length < 2 || desired.length < 3) return 'skipped';

  const { rows: byOid } = await client.query('SELECT * FROM users WHERE entra_oid = $1', [oid]);
  let row = byOid[0];
  if (!row) {
    const { rows: byEmail } = await client.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    row = byEmail[0];
    if (row?.entra_oid && row.entra_oid !== oid) return 'skipped';
  }

  if (!row) {
    const username = await uniqueUsername(client, desired, null);
    await client.query(
      `INSERT INTO users (name, email, password, initials, color, username, job_title, must_change_password,
                          profiles, permissions, directed_teams, directed_sectors, entra_oid, department, active)
       VALUES ($1, $2, NULL, $3, $4, $5, '', false, '["colaborador"]', '[]', '[]', '[]', $6, $7, true)`,
      [name, email, initialsFrom(name), colorFor(username), username, oid, department || null]
    );
    return 'created';
  }

  // Conta local encontrada pelo e-mail: só vincula o diretório. Não mexe em senha, perfil nem nome.
  if (!row.entra_oid) {
    await client.query(
      `UPDATE users SET entra_oid = $1, department = $2, active = true WHERE id = $3`,
      [oid, department || null, row.id]
    );
    return 'updated';
  }

  let username = row.username;
  const { rows: taken } = await client.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1',
    [desired, row.id]
  );
  if (!taken.length) username = desired;

  let nextEmail = email;
  const { rows: emailTaken } = await client.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
    [email, row.id]
  );
  if (emailTaken.length) nextEmail = row.email;

  await client.query(
    `UPDATE users SET name = $1, email = $2, username = $3, initials = $4, department = $5, active = true WHERE id = $6`,
    [name, nextEmail, username, initialsFrom(name), department || null, row.id]
  );
  return 'updated';
}

async function syncDirectory() {
  const people = [];
  for (const token of await directoryTokens()) {
    people.push(...await listMembers(token));
  }
  return tx(async (client) => {
    const { rows: blocks } = await client.query('SELECT entra_oid FROM directory_blocks');
    const blocked = new Set(blocks.map((row) => String(row.entra_oid)));
    const counts = { created: 0, updated: 0, deactivated: 0, skipped: 0 };
    const oids = [];
    for (const person of people) {
      const oid = String(person.id || '');
      const result = await applyPerson(client, person, blocked);
      counts[result] += 1;
      if (oid && (result !== 'skipped' || blocked.has(oid))) oids.push(oid);
    }
    // Lista vazia não desativa ninguém: evita apagar o diretório por uma falha de filtro.
    // Quem está em qualquer um dos tenants permanece ativo.
    if (oids.length) {
      const { rows } = await client.query(
        `UPDATE users SET active = false, token_version = token_version + 1
          WHERE entra_oid IS NOT NULL AND NOT JSON_CONTAINS($1, JSON_QUOTE(entra_oid)) AND active IS DISTINCT FROM false
          RETURNING id`,
        [oids]
      );
      counts.deactivated = rows.length;
      if (rows.length) {
        await client.query(
          'UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL AND JSON_CONTAINS($1, CAST(user_id AS CHAR))',
          [rows.map(r => r.id)]
        );
      }
    }
    return counts;
  });
}

module.exports = { syncDirectory };
