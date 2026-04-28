
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Activity, Subject, AgeGroup, ActivityDuration, LessonPlan, DifficultyLevel } from "../types";

const SYSTEM_INSTRUCTION = `You are an experienced early childhood educator specializing in Pre-K through 1st grade. 
Your role is to generate developmentally appropriate, inclusive, and calm learning activities for young children. 

CULTURAL REPRESENTATION:
Representation is essential: all children referenced or implied in activities, examples, or illustrations must be Black and Brown children. Use culturally affirming language and center Black and Brown children in all pedagogical contexts.

INCLUSIVE SCAFFOLDING:
For every activity, always provide specific 'Inclusive Scaffolding' modifications for:
1. Fine Motor support (e.g., using larger tools, tape, or finger painting instead of pencils).
2. Neurodivergence/Sensory needs (e.g., providing a quiet space, visual timers, or sensory alternatives).
3. ELL (English Language Learners) (e.g., using visual cards, repetitive gestures, or key vocabulary in home languages).

STEAM PEDAGOGY (Ages 3-7):
When STEAM is selected, prioritize hands-on exploration over instruction.
- Focus on: Simple building, designing, cause and effect, asking "what happens if...", and using everyday materials.
- Goal: Encourage curiosity and observation, not "correct" answers.
- Vibe: Playful, calm, and exploratory.
- Avoid: Complex scientific terminology, experiments requiring precise measurements, or outcomes that feel like assessments.
- STEAM Reflection Questions: Invite curiosity and observation. Examples: "What did you notice?", "What happened when you tried it?", "What would you like to try next?"

REFLECTION QUESTIONS (General):
- Developmentally appropriate for ages 3–7.
- Concrete and simple.
- Limited to one idea at a time.
- Free of abstract metaphors or performative language.
Example of good: "Which color did you like using most?"
Example of bad: "How did your heart feel when you shared?" (Too abstract).

RESOURCES & SUPPORT:
For every activity and lesson plan, generate a "resources" object with all four categories tailored to the specific subject, theme, age group, and skill:

1. youtubeVideos (2-3 items): Suggest specific YouTube search queries an educator can use to find relevant instructional, read-aloud, or movement videos. Format: {title: "What this video covers", searchQuery: "the exact search string"}. Examples: "letter sounds phonics for preschoolers", "counting songs for toddlers", "feelings and emotions books read aloud pre-k".

2. webResources (2-3 items): Recommend established educational websites relevant to the skill or theme. Use well-known sources like pbskids.org, readworks.org, zerotothree.org, naeyc.org, understood.org, starfall.com, abcya.com, scholastic.com/parents, khanacademy.org, or education.com. Format: {title, url, description}.

3. downloadableGuides (1-2 items): Suggest free printable activity sheets, visual guides, or PDFs. Describe what the resource is and name where it can be found (Teachers Pay Teachers free section, Education.com, Super Teacher Worksheets, Teachers.net). Format: {title, description}.

4. professionalContacts: CRITICAL — only populate if the activity's primary theme or skill directly involves: grief, loss, trauma, anxiety, anger management, emotional dysregulation, sensory processing challenges, speech/language development, fine motor delays, or other developmental/mental health concerns. If applicable, include 1-2 real national organizations such as NASP (nasponline.org), ASHA (asha.org), AOTA (aota.org), SAMHSA (samhsa.gov), Zero to Three (zerotothree.org), Child Mind Institute (childmind.org), or NAMI (nami.org). Format: {name, description, website}. Otherwise, return an EMPTY array [].`;

const RESOURCES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    youtubeVideos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          searchQuery: { type: Type.STRING }
        },
        required: ["title", "searchQuery"]
      }
    },
    webResources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          url: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["title", "url", "description"]
      }
    },
    downloadableGuides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["title", "description"]
      }
    },
    professionalContacts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          website: { type: Type.STRING }
        },
        required: ["name", "description", "website"]
      }
    }
  },
  required: ["youtubeVideos", "webResources", "downloadableGuides", "professionalContacts"]
};

const ACTIVITY_CORE_PROPERTIES = {
  label: { type: Type.STRING },
  primarySkill: { type: Type.STRING },
  duration: { type: Type.STRING },
  difficulty: { type: Type.STRING },
  materials: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        householdAlternative: { type: Type.STRING }
      },
      required: ["name"]
    }
  },
  steps: { type: Type.ARRAY, items: { type: Type.STRING } },
  modifications: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ['Fine Motor', 'Neurodivergence', 'ELL', 'Sensory'] },
        suggestion: { type: Type.STRING }
      },
      required: ["type", "suggestion"]
    }
  },
  reflectionQuestion: { type: Type.STRING },
};

const ACTIVITY_CORE_REQUIRED = ["label", "primarySkill", "duration", "difficulty", "materials", "steps", "modifications", "reflectionQuestion"];

// Used for activities within lesson plans (resources are at plan level instead)
const ACTIVITY_SCHEMA_CORE = {
  type: Type.OBJECT,
  properties: ACTIVITY_CORE_PROPERTIES,
  required: ACTIVITY_CORE_REQUIRED,
};

// Used for standalone activities (includes per-activity resources)
const ACTIVITY_SCHEMA = {
  type: Type.OBJECT,
  properties: { ...ACTIVITY_CORE_PROPERTIES, resources: RESOURCES_SCHEMA },
  required: [...ACTIVITY_CORE_REQUIRED, "resources"],
};

export const generateActivity = async (
  age: AgeGroup,
  subject: Subject,
  theme: string,
  durationPreference: ActivityDuration,
  difficulty: DifficultyLevel
): Promise<Activity> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let ageGuideline = age === '3' ? "1-3 steps, sensory exploration." : age === '4' ? "3-5 steps, simple curiosity." : age === '7' ? "5-7 steps, beginning reading/writing, place value, simple addition and subtraction, more independent work, and connections between concepts." : "4-6 steps, early literacy/math focus.";
  
  let difficultyGuideline = "";
  switch(difficulty) {
    case 'Easy': 
      difficultyGuideline = "Focus on foundational concepts, use repetitive language, and provide heavy scaffolding. Keep tasks very simple.";
      break;
    case 'Hard':
      difficultyGuideline = "Introduce slightly more advanced concepts, encourage more independence, and add an extra layer of challenge or critical thinking.";
      break;
    default:
      difficultyGuideline = "Provide standard developmentally appropriate challenges for this specific age group.";
  }

  const prompt = `Create a calm, developmentally appropriate activity for a ${age}-year-old child.
  Subject Area: ${subject}. Theme: ${theme || 'General'}. Duration: ${durationPreference}. Difficulty: ${difficulty}.
  Age-Specific Complexity: ${ageGuideline}
  Difficulty Guideline: ${difficultyGuideline}
  CRITICAL SUBJECT RULE: The activity MUST be firmly rooted in ${subject}. The subject is the primary constraint and must always be honored. The theme "${theme || 'General'}" provides cultural context and flavor only — it must never pull the activity into a different subject area. For example, if the subject is SEL and the theme is "anger," the activity must address emotional regulation, not math or literacy. If the theme suggests a different subject, discard that aspect and stay within ${subject}.
  Requirements: 1 primary skill, household alternatives for materials, simple steps, concrete reflection question. Include inclusive modifications for diverse learners. Center Black and Brown joy.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: ACTIVITY_SCHEMA,
      systemInstruction: SYSTEM_INSTRUCTION
    },
  });

  const data = JSON.parse(response.text);
  return { ...data, ageGroup: age, subject, theme: theme || 'General' };
};

export const generateActivityFromImage = async (
  base64Image: string,
  age: AgeGroup,
  subject: Subject
): Promise<Activity> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Identify the materials in this image and create ONE calm, developmentally appropriate activity for a ${age}-year-old child.
  Subject: ${subject}. 
  The activity MUST primarily use the materials visible in the image.
  Include 1 primary skill, simple steps, concrete reflection question, and inclusive modifications. 
  Center Black and Brown joy and mastery.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image
        }
      },
      { text: prompt }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ACTIVITY_SCHEMA,
      systemInstruction: SYSTEM_INSTRUCTION
    },
  });

  const data = JSON.parse(response.text);
  return { ...data, ageGroup: age, subject, theme: "Material Scanner" };
};

export const generateLessonPlan = async (
  age: AgeGroup,
  subject: Subject,
  theme: string,
  difficulty: DifficultyLevel
): Promise<LessonPlan> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let difficultyGuideline = difficulty === 'Easy' ? "Focus on core basics." : difficulty === 'Hard' ? "Encourage more complex connections." : "Standard age-appropriate complexity.";

  const prompt = `Create a cohesive mini-lesson plan for a ${age}-year-old child consisting of a sequence of 3 to 4 activities.
  Subject: ${subject}. Theme: ${theme || 'General'}. Difficulty Level: ${difficulty}.
  CRITICAL SUBJECT RULE: Every activity in the plan MUST be firmly rooted in ${subject}. The subject is the primary constraint. The theme "${theme || 'General'}" provides cultural context and flavor only — it must never shift any activity into a different subject area. Stay within ${subject} for all activities.
  The lesson should scaffold learning, starting with an introduction and ending with a creative or reflective closing.
  Complexity Adjustment: ${difficultyGuideline}
  Each activity in the sequence should follow the standard activity structure with steps, concrete reflection question, and inclusive modifications.
  Center Black and Brown children in all contexts.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          overview: { type: Type.STRING, description: "A short summary of the lesson's flow." },
          primarySkill: { type: Type.STRING },
          difficulty: { type: Type.STRING },
          learningObjective: { type: Type.STRING },
          activities: {
            type: Type.ARRAY,
            items: ACTIVITY_SCHEMA_CORE
          },
          resources: RESOURCES_SCHEMA
        },
        required: ["title", "overview", "primarySkill", "difficulty", "learningObjective", "activities", "resources"]
      },
      systemInstruction: SYSTEM_INSTRUCTION
    }
  });

  const data = JSON.parse(response.text);
  data.activities = data.activities.map((act: any) => ({
    ...act,
    ageGroup: age,
    subject,
    theme: theme || 'General'
  }));
  
  return data;
};

export const generateImageForPlan = async (title: string, theme: string, activities: string[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `A soft, high-quality artistic watercolor illustration for an early childhood lesson plan titled "${title}" with the theme "${theme}".
  Visual details: A group of 2-3 joyful Black and Brown children (diverse skin tones) collaborating peacefully in a sun-drenched, airy classroom or garden. Each child must have a distinctly different hairstyle chosen from this list: box braids, braids with beads, locs/dreads, twist outs, afro puffs, cornrows, natural coils, bantu knots. No two children should share the same hairstyle. Do not default to ponytails.
  Atmosphere: Calm, exploratory, and nurturing.
  Style: Minimalist watercolor, soft pastel color palette (sage, peach, sky blue), airy composition with gentle brushstrokes and visible paper texture.
  Text legibility: If any text, letters, numbers, or words appear on papers, whiteboards, books, or objects in the scene, they must be right-side up and fully legible — never upside down, sideways, or mirrored.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "16:9" } }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  return 'https://picsum.photos/800/450';
};

export const generateActivityImage = async (activity: Activity): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const actionDescription = activity.steps.join(' ');
  const materialsList = activity.materials.map(m => m.name).join(', ');

  const prompt = `A detailed, calm, and high-quality artistic watercolor illustration for the children's activity: "${activity.label}".
  Scene: Joyful Black and Brown children (Pre-K to 1st grade age) with diverse skin tones engaging in: ${actionDescription.substring(0, 200)}.
  Hairstyles: Each child in the scene must have a distinctly different hairstyle. Use a variety from this list: box braids, braids with beads, locs/dreads, twist outs, afro puffs, cornrows, natural coils, bantu knots. No two children should share the same hairstyle, and do not default to ponytails.
  Materials visible: ${materialsList}.
  Cultural context: Centering Black and Brown joy, curiosity, and mastery.
  Artistic Style: Soft watercolor with gentle transitions, light-filled environment, pastel-heavy palette, minimalist details, and artistic brushwork that feels warm and hand-painted. No floating text overlays or caption labels in the image. If any text, letters, or numbers appear naturally on papers, whiteboards, books, or objects in the scene, they must be right-side up and fully legible — never upside down, sideways, or mirrored.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "16:9" } }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  return 'https://picsum.photos/800/450';
};

export const generateSpeech = async (text: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read this activity guide warmly and slowly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

export const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
};

export const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate = 24000, numChannels = 1): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
};
