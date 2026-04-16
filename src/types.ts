export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  whatsapp: string;
  email: string;
  address?: string;
  photoURL?: string;
  urls?: { label: string; url: string }[];
  customFields?: { key: string; value: string }[];
  type?: 'workshop' | 'project';
}

export interface Ticket {
  id: string;
  date: string;
  description: string;
  resolution?: string;
  resolutionItems?: { task: string; amount: number }[];
  isCompleted?: boolean;
  photos: string[];
}

export interface Device {
  id: string;
  clientId: string;
  entryDate: string;
  brand: string;
  model: string;
  deviceType: string;
  deviceTypeOther?: string;
  hardware: string;
  hardwareDetails?: { key: string; value: string }[];
  problem: string;
  photos: string[];
  msinfo?: { key: string; value: string }[];
  dxdiag?: { key: string; value: string }[];
  tickets?: Ticket[];
}

export interface Tool {
  id: string;
  name: string;
  url: string;
  description?: string;
  type: 'link' | 'file';
  fileName?: string;
}

export interface BudgetItem {
  title: string;
  description: string;
  quantity: number;
  amount: number;
}

export interface BudgetScopeSection {
  title: string;
  items: { title: string; description: string }[];
}

export interface BudgetDirectCost {
  item: string;
  detail: string;
  amount: number;
}

export interface BudgetProfessionalFee {
  item: string;
  description: string;
  amount: number;
}

export interface BudgetTimelineItem {
  range: string;
  activity: string;
}

export interface BudgetPaymentTerm {
  label: string;
  details: string;
}

export interface ServiceTask {
  id: string;
  clientId: string;
  projectId?: string;
  date: string;
  description: string;
  duration: string;
  amount: number;
  isCompleted: boolean;
  budgetId?: string;
}

export interface ProjectDoc {
  id: string;
  name: string;
  url: string;
  type: 'file' | 'image' | 'link';
  date: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  startDate: string;
  description: string;
  status: 'active' | 'completed' | 'on-hold';
  documents: ProjectDoc[];
  notes?: string;
}

export interface Budget {
  id: string;
  deviceId?: string;
  projectId?: string;
  clientId: string;
  date: string;
  items: BudgetItem[];
  total: number;
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected';
  type?: 'device' | 'support' | 'service' | 'project';
  
  // Elaborated Fields for Project/Services:
  title?: string;
  summary?: string;
  scope?: BudgetScopeSection[];
  directCosts?: BudgetDirectCost[];
  professionalFees?: BudgetProfessionalFee[];
  timeline?: BudgetTimelineItem[];
  paymentTerms?: BudgetPaymentTerm[];
  validityDays?: number;
}

export interface ServiceType {
  id: string;
  name: string;
  defaultPrice: number;
  category?: string;
}
