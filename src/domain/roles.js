export const roles = Object.freeze({
  doctor: 'doctor',
  nurse: 'nurse_staff',
  admin: 'admin'
});

const permissions = Object.freeze({
  doctor: new Set([
    'patient:read', 'patient:create', 'episode:manage', 'encounter:create',
    'encounter:edit', 'encounter:complete', 'encounter:correct',
    'symptom:edit', 'medication:manage', 'body-composition:link'
  ]),
  nurse_staff: new Set([
    'patient:read', 'patient:create', 'encounter:create', 'encounter:edit',
    'symptom:edit', 'body-composition:link'
  ]),
  admin: new Set([
    'patient:read', 'patient:create', 'episode:manage', 'encounter:create',
    'encounter:edit', 'encounter:complete', 'encounter:correct',
    'symptom:edit', 'medication:manage', 'body-composition:link',
    'user:read', 'audit:read', 'backup:manage', 'config:manage', 'migration:manage'
  ])
});

export function hasPermission(role, permission) {
  return permissions[role]?.has(permission) === true;
}

export function userView(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    active: Boolean(user.active)
  };
}
