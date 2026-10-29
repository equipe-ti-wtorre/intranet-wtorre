class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

// Envolve handlers async para que erros cheguem ao middleware de erro.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first.path.join('.');
    throw new HttpError(400, field ? `${field}: ${first.message}` : first.message);
  }
  return result.data;
}

function intParam(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} inválido`);
  return n;
}

module.exports = { HttpError, ah, parse, intParam };
