export type WorkflowEnrollmentSelection = {
  communityId: string;
  enrollmentId: string;
} | null;

export function isCurrentWorkflowEnrollmentRequest(input: {
  requestGeneration: number;
  currentGeneration: number;
  requestedCommunityId: string;
  requestedEnrollmentId: string;
  selection: WorkflowEnrollmentSelection;
}): boolean {
  return Boolean(
    input.requestGeneration === input.currentGeneration &&
      input.selection &&
      input.selection.communityId === input.requestedCommunityId &&
      input.selection.enrollmentId === input.requestedEnrollmentId,
  );
}
