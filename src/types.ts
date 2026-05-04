/** Shared types used across MCP tools — matches Squad backend models */

export interface Issue {
  id: string;
  key: string;
  projectId: string;
  parentId?: string;
  epicId?: string;
  sprintId?: string;
  type: string;
  status: string;
  priority: string;
  executionStatus: string;
  title: string;
  description?: string;
  phaseContext?: Record<string, unknown>;
  techChecks?: Record<string, unknown>;
  invest?: Record<string, unknown>;
  affectedRepos?: string[];
  epicColor?: string;
  assigneeId?: string;
  reporterId?: string;
  storyPoints?: number;
  originalEstimate?: number;
  timeSpent?: number;
  dueDate?: string;
  startDate?: string;
  resolvedAt?: string;
  order: number;
  labels?: Label[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  leadId?: string;
  defaultAssigneeId?: string;
  projectType: string;
  techStack?: string;
  autoExecute?: boolean;
  issueCounter?: number;
  statuses: ProjectStatus[];
  issueTypes?: ProjectIssueType[];
  repos?: ProjectRepo[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectRepo {
  id: string;
  projectId: string;
  name: string;
  provider: string; // 'github' | 'azure' | 'none'
  githubRepo?: string;
  azureOrg?: string;
  azureProject?: string;
  azureRepo?: string;
  isPrimary: boolean;
  webhookConfigured: boolean;
}

export interface IssuePR {
  id: string;
  issueId: string;
  repoId: string;
  repoName: string;
  prNumber: number;
  title?: string;
  url?: string;
  status: string; // 'open' | 'merged' | 'closed'
  source: string; // 'webhook' | 'manual'
}

export interface ProjectStatus {
  id: string;
  name: string;
  category: string;
  color?: string;
  order: number;
  agentInstructions?: string;
  systemRole?: string;
  sddiMoment?: string;
  sdlcStep?: string;
  isDefaultForRole?: boolean;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  title: string;
  path: string;
  content: string;
  docType: string;
  source: string;
  taskTypes?: string[] | null;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SquadContext {
  issue: Issue;
  currentStatus: ProjectStatus | null;
  projectName: string;
  projectKey: string;
  techStack?: string;
  repos: ProjectRepo[];
  affectedRepoIds: string[];
  linkedPrs: IssuePR[];
  specMd?: string;
  documentRefs: ProjectDocumentRef[];
}

export interface ProjectDocumentRef {
  id: string;
  title: string;
  docType: string;
  version: number;
}

export interface ProjectIssueType {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: string;
  plan?: string;
  createdAt?: string;
}

export interface PhaseExecution {
  id: string;
  issueId: string;
  phase: string;
  status: string;
  agentUser?: string;
  summary?: string;
  startedAt: string;
  completedAt?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  leadId: string;
  createdAt?: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  addedBy?: string;
  createdAt?: string;
  user?: User;
}

export interface Activity {
  id: string;
  issueId: string;
  userId: string;
  type: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  issueId?: string;
  projectId?: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface VotingSession {
  id: string;
  issueId: string;
  createdBy: string;
  status: string;
  finalPoints?: number;
  createdAt: string;
  votes?: Vote[];
}

export interface Vote {
  id: string;
  sessionId: string;
  userId: string;
  points?: number;
  createdAt: string;
}

export interface IssueLink {
  id: string;
  linkType: string;
  sourceIssueId: string;
  targetIssueId: string;
  createdBy: string;
  createdAt: string;
}

export interface Label {
  id: string;
  name: string;
  color?: string;
}

export interface Invitation {
  id: string;
  email: string;
  projectId?: string;
  teamId?: string;
  role: string;
  invitedBy: string;
  token: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface TechCheckCategory {
  id: string;
  projectId: string;
  name: string;
  color: string;
  order: number;
  createdAt?: string;
}

export interface DailySpin {
  id: string;
  projectId: string;
  userId: string;
  spinDate: string;
  spunBy: string;
  createdAt?: string;
}
