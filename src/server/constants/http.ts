export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYMENT_REQUIRED: 402,
  LOCKED: 423,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const AUTH_ERROR_MESSAGES = {
  MISSING_TOKEN: 'Token d\'authentification manquant.',
  INVALID_TOKEN: 'Session expirée ou jeton invalide.',
  UNAUTHENTICATED: 'Non authentifié.',
  USER_NOT_FOUND: 'Utilisateur introuvable.',
  ACCOUNT_DISABLED: 'Compte désactivé. Contactez l\'administrateur.',
  NO_TENANT: 'Aucun abonnement associé à ce compte.',
  TENANT_NOT_FOUND: 'Abonnement introuvable.',
  ACCESS_DENIED: 'Accès refusé. Permission insuffisante.',
} as const;
