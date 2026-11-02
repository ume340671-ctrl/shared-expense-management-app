/** Domain types for T9DYA MANAGER */

export type Housemate = {
  id: string;
  full_name: string;
  created_at: string;
};

export type Purchase = {
  id: string;
  item_name: string;
  /** Prix unitaire en dirhams (DH) */
  unit_price: number;
  /** Quantité (>= 1) */
  quantity: number;
  /** Référence vers housemates.id */
  buyer_id: string;
  /** Date de l'achat au format YYYY-MM-DD */
  purchase_date: string;
  /** Remarque facultative */
  notes: string | null;
  /** Chemin de la photo dans Supabase Storage (bucket purchase-photos), ou null */
  photo_path: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseWithBuyer = Purchase & {
  /** Nom complet de l'acheteur, joint depuis la table housemates */
  buyer_name: string;
};

export type PurchaseInput = {
  item_name: string;
  unit_price: number;
  quantity: number;
  buyer_id: string;
  purchase_date: string;
  notes?: string | null;
};

export type PurchaseFilters = {
  search: string;
  buyerId: string | "all";
  /** Mois au format YYYY-MM, ou "all" */
  month: string | "all";
  sort: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
};

export type PersonStats = {
  housemate: Housemate;
  purchaseCount: number;
  totalPaid: number;
  /** Pourcentage du total général (0 si total = 0) */
  percentage: number;
};

export type GlobalStats = {
  totalSpent: number;
  purchaseCount: number;
  currentMonthSpent: number;
  lastPurchase: PurchaseWithBuyer | null;
  perPerson: PersonStats[];
};

/** Types d'action journalisées */
export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "UPLOAD";

export type AuditLog = {
  id: string;
  /** Identifiant de l'utilisateur authentifié (auth.uid()) */
  actor_id: string | null;
  /** E-mail du compte (rempli par le trigger depuis le JWT — non falsifiable) */
  actor_email: string | null;
  action: AuditAction;
  /** Type d'élément concerné : "purchase", "photo"… */
  entity_type: string;
  /** Identifiant de l'élément concerné lorsque disponible */
  entity_id: string | null;
  /** Libellé lisible de l'élément (ex : nom de l'article) */
  entity_label: string | null;
  /** Anciennes valeurs (JSON) pour les modifications */
  old_values: Record<string, unknown> | null;
  /** Nouvelles valeurs (JSON) */
  new_values: Record<string, unknown> | null;
  /** Résumé lisible de l'opération */
  summary: string;
  created_at: string;
};

export type AuditQuery = {
  search: string;
  action: AuditAction | "all";
  /** E-mail de l'auteur, ou "all" */
  actor: string;
  /** Mois au format YYYY-MM, ou "all" */
  month: string;
  page: number;
  pageSize: number;
};

export type AuditPage = {
  items: AuditLog[];
  total: number;
};

export type AuditClearPreview = {
  request_id: string;
  cutoff: string;
  count: number;
};

export type Session = {
  email: string;
} | null;
