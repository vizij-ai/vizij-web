export interface IssueEntry {
  targetId: string;
  label: string;
  issues: string[];
  isStandardInput: boolean;
  rootKey: string | null;
}
