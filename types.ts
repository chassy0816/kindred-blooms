
export interface Material {
  name: string;
  householdAlternative?: string;
}

export interface Modification {
  type: 'Fine Motor' | 'Neurodivergence' | 'ELL' | 'Sensory';
  suggestion: string;
}

export interface YouTubeResource {
  title: string;
  searchQuery: string;
}

export interface WebResource {
  title: string;
  url: string;
  description: string;
}

export interface DownloadableGuide {
  title: string;
  description: string;
}

export interface ProfessionalContact {
  name: string;
  description: string;
  website: string;
}

export interface ResourcesAndSupport {
  youtubeVideos: YouTubeResource[];
  webResources: WebResource[];
  downloadableGuides: DownloadableGuide[];
  professionalContacts: ProfessionalContact[];
}

export interface Activity {
  label: string;
  primarySkill: string;
  duration: string;
  difficulty: DifficultyLevel;
  materials: Material[];
  steps: string[];
  modifications: Modification[];
  reflectionQuestion: string;
  ageGroup: string;
  subject: string;
  theme: string;
  imageUrl?: string;
  resources?: ResourcesAndSupport;
}

export interface LessonPlan {
  title: string;
  overview: string;
  primarySkill: string;
  difficulty: DifficultyLevel;
  learningObjective: string;
  activities: Activity[];
  imageUrl?: string;
  resources?: ResourcesAndSupport;
}

export enum Subject {
  Literacy = 'Literacy',
  Math = 'Math',
  SEL = 'Social Emotional Learning (SEL)',
  Creativity = 'Creativity & Play',
  Nature = 'Nature & Exploration',
  STEAM = 'STEAM (Science & Engineering)'
}

export type AgeGroup = '3' | '4' | '5' | '6' | '7';
export type ActivityDuration = 'Short' | 'Medium';
export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';
export type AppMode = 'Single' | 'LessonPlan' | 'Scanner';
