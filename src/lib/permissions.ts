import { User } from '../types';

// =============================================================================
//  PER-WORKER PERMISSIONS
// -----------------------------------------------------------------------------
//  A worker's access is stored in `profiles.permissions` as a JSON map:
//      { "reservations": ["view", "create", "finalize"], "clients": ["view"] }
//  An interface is visible to a worker only when it contains the "view" action.
//  Individual buttons/actions are gated with hasPermission(user, iface, action).
//  Admins & super-admins always have every permission.
// =============================================================================

export type PermissionMap = Record<string, string[]>;

export interface PermAction {
  id: string;
  label: string;
}

export interface PermInterface {
  /** Must match the tab id used in App.tsx / Sidebar. */
  id: string;
  label: string;
  actions: PermAction[];
}

const VIEW: PermAction = { id: 'view', label: 'Voir' };
const CREATE: PermAction = { id: 'create', label: 'Créer' };
const EDIT: PermAction = { id: 'edit', label: 'Modifier' };
const DELETE: PermAction = { id: 'delete', label: 'Supprimer' };

/**
 * Every interface an admin can grant to a worker, with its available actions.
 * `dashboard`, `my-payments` are handled specially (see notes below) and are
 * therefore not listed here — `my-payments` is always available to a worker and
 * `dashboard` is granted through this catalog like any other page.
 */
export const PERMISSION_CATALOG: PermInterface[] = [
  { id: 'dashboard',    label: 'Tableau de bord',        actions: [VIEW] },
  { id: 'reservations', label: 'Réservations',           actions: [VIEW, CREATE, { id: 'finalize', label: 'Finaliser' }, EDIT, DELETE] },
  { id: 'clients',      label: 'Clients',                actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'prestations',  label: 'Prestations & Services', actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'products',     label: 'Produits',               actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'product-purchases', label: 'Achats Produits',   actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'sales',        label: 'Point de Vente',         actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'suppliers',    label: 'Fournisseurs',           actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'employees',    label: 'Employés',               actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'caisse',       label: 'Caisse',                 actions: [VIEW, CREATE] },
  { id: 'expenses',     label: 'Dépenses',               actions: [VIEW, CREATE, EDIT, DELETE] },
  { id: 'reports',      label: 'Rapports',               actions: [VIEW] },
  { id: 'config',       label: 'Paramètres',             actions: [VIEW, EDIT] },
];

/** Interfaces a worker can always open regardless of the permission map. */
export const ALWAYS_VISIBLE_FOR_WORKER = ['my-payments'];

function isPrivileged(role?: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * Does the given user have `action` on `interfaceId`?
 * Admins/super-admins are always allowed. Workers must have the action listed
 * in their permission map. `my-payments` is always allowed for workers.
 */
export function hasPermission(
  user: Pick<User, 'role' | 'permissions'> | null | undefined,
  interfaceId: string,
  action: string = 'view',
): boolean {
  if (!user) return false;
  if (isPrivileged(user.role)) return true;
  if (ALWAYS_VISIBLE_FOR_WORKER.includes(interfaceId)) return true;
  const acts = user.permissions?.[interfaceId];
  return Array.isArray(acts) && acts.includes(action);
}

/** Can this user open (see) the interface at all? */
export function canViewInterface(
  user: Pick<User, 'role' | 'permissions'> | null | undefined,
  interfaceId: string,
): boolean {
  return hasPermission(user, interfaceId, 'view');
}

/**
 * Pick a sensible landing tab for a worker: prefer reservations, then their
 * payments, then the first interface they are allowed to open.
 */
export function firstAllowedTab(
  user: Pick<User, 'role' | 'permissions'> | null | undefined,
): string {
  if (canViewInterface(user, 'reservations')) return 'reservations';
  const firstGranted = PERMISSION_CATALOG.find(i => canViewInterface(user, i.id));
  if (firstGranted) return firstGranted.id;
  return 'my-payments';
}
