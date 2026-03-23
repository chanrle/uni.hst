export interface UserProfile {
  id: string;
  email: string;
  name: string;
  academicStanding: string;
  interests: string[];
  budget: number;
  plannedMajor: string;
  cvSummary?: string;
  financialStatement?: string;
}

export interface University {
  id: string;
  name: string;
  country: string;
  location: string;
  fitReason: string;
  tuitionFee: number;
  entryRequirements: string;
  scholarships: string[];
  major: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string;
  completed: boolean;
  category: 'preparation' | 'submission' | 'follow-up';
}

export interface ShortlistItem extends University {
  userRank: number;
  status: 'shortlisted' | 'applying' | 'applied' | 'accepted' | 'rejected';
  tasks: Task[];
}
