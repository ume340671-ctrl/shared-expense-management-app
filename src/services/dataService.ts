import type {
  AuditClearPreview,
  AuditPage,
  AuditQuery,
  Housemate,
  PurchaseInput,
  PurchaseWithBuyer,
} from "@/types";
import { isSupabaseConfigured } from "@/lib/config";
import { supabaseDataService } from "./supabaseData";
import { localDataService } from "./localData";

/**
 * Contrat d'accès aux données.
 * La base Supabase reste la source de vérité en production ;
 * une implémentation locale de secours est utilisée si Supabase
 * n'est pas configuré (développement / prévisualisation).
 */
export interface DataService {
  listHousemates(): Promise<Housemate[]>;
  listPurchases(): Promise<PurchaseWithBuyer[]>;
  createPurchase(input: PurchaseInput): Promise<PurchaseWithBuyer>;
  updatePurchase(id: string, input: PurchaseInput): Promise<PurchaseWithBuyer>;
  deletePurchase(id: string): Promise<void>;
  /** Associe (ou retirer, si null) le chemin de la photo d'un achat */
  setPurchasePhoto(id: string, photoPath: string | null): Promise<void>;
  /** Journal d'audit paginé et filtré */
  listAuditLogs(query: AuditQuery): Promise<AuditPage>;
  /** Liste des auteurs présents dans le journal (filtre par utilisateur) */
  listAuditActors(): Promise<string[]>;
  /** Server-issued cutoff and request ID for an explicit whole-history purge. */
  previewAuditClear(): Promise<AuditClearPreview>;
  clearAuditHistory(preview: AuditClearPreview, confirmation: string): Promise<number>;
  /** Abonnement aux nouveaux événements d'audit */
  subscribeToAuditChanges(listener: () => void): () => void;
  /** Abonnement aux changements temps réel ; retourne une fonction de désabonnement */
  subscribeToChanges(listener: () => void): () => void;
}

export const dataService: DataService = isSupabaseConfigured
  ? supabaseDataService
  : localDataService;

export const usingSupabase = isSupabaseConfigured;
