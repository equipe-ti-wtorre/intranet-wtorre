import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { InteractionType } from '@azure/msal-browser';
import { MSAL_INSTANCE, MSAL_GUARD_CONFIG, MsalGuardConfiguration } from '@azure/msal-angular';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import {
  MsalConfigService,
  msalConfigInitializer,
} from './services/msal-config.service';
import {
  AuthService,
  authMsalRedirectInitializer,
  authSessionInitializer,
} from './services/auth.service';
import {
  SiteBrandingService,
  siteBrandingInitializer,
} from './services/site-branding.service';

export function msalInstanceFactory(msalConfig: MsalConfigService) {
  const instance = msalConfig.getInstance();
  if (!instance) {
    throw new Error('MSAL não inicializado. Verifique APP_INITIALIZER.');
  }
  return instance;
}

export function msalGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: ['User.Read', 'openid', 'profile'],
    },
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: msalConfigInitializer,
      deps: [MsalConfigService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: authMsalRedirectInitializer,
      deps: [AuthService, MsalConfigService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: authSessionInitializer,
      deps: [AuthService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: siteBrandingInitializer,
      deps: [SiteBrandingService],
      multi: true,
    },
    {
      provide: MSAL_INSTANCE,
      useFactory: msalInstanceFactory,
      deps: [MsalConfigService],
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: msalGuardConfigFactory,
    },
  ],
};
