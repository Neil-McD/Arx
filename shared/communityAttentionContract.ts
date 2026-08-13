// This is an execution bound, not an account limit. The client opens another
// query batch for larger accounts so one attention computation stays well
// below Convex's per-function index-range ceiling at the ten-channel maximum.
export const MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY = 25;
