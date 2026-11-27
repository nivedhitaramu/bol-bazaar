import "server-only";
import { getStore, storeMode } from "./store";

export type { DashboardData, ProductWithSeller, ConversationFull } from "./store/types";
export { storeMode };

/** Read helpers used by server components and API routes. All go through the active Store. */
export const getSeller = (id: string) => getStore().getSeller(id);
export const getProduct = (id: string) => getStore().getProduct(id);
export const listPublished = (filters: { category?: string; state?: string; sellerId?: string } = {}) =>
  getStore().listPublished(filters);
export const listFacets = () => getStore().listFacets();
export const getConversation = (id: string) => getStore().getConversation(id);
export const getMessages = (conversationId: string) => getStore().getMessages(conversationId);
export const getConversationOrders = (conversationId: string) => getStore().getConversationOrders(conversationId);
export const getDashboard = (sellerId: string) => getStore().getDashboard(sellerId);
