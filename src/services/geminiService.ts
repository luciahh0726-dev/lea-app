import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AISuggestedStage {
  name: string;
  durationDays: number;
  tasks: string[];
}

export const generateStudyPlan = async (projectName: string, userDescription?: string) => {
  const model = "gemini-3-flash-preview";
  
  const prompt = userDescription 
    ? `I want to study "${projectName}". The user provided the following description/tasks: "${userDescription}". 
       Please analyze this input and create a structured study plan with 3-5 stages that covers these requirements.
       Distribute the tasks into these stages logically.
       Each stage should have a name, a duration in days, and 2-4 recurring daily tasks.
       Return the plan in a structured format.`
    : `I want to study "${projectName}". Please create a structured study plan with 3-5 stages. 
       Each stage should have a name, a duration in days, and 2-4 recurring daily tasks.
       Return the plan in a structured format.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the study stage" },
            durationDays: { type: Type.NUMBER, description: "Duration of this stage in days" },
            tasks: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of recurring daily tasks for this stage"
            },
          },
          required: ["name", "durationDays", "tasks"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text) as AISuggestedStage[];
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};

export const generateDailyReview = async (tasks: { name: string, type: string }[]) => {
  const model = "gemini-3-flash-preview";
  
  const taskList = tasks.map(t => `- [${t.type}] ${t.name}`).join('\n');
  const prompt = `Today I completed the following tasks:\n${taskList}\n\nPlease provide a warm, interactive review of my day. 
  1. Start by praising me enthusiastically for what I've achieved. 
  2. Mention specific highlights from the task list.
  3. End by asking me a thoughtful question about how I feel about today's progress or what I found most meaningful.
  Keep it encouraging and personal. Return the response as markdown.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || "You did amazing today! How do you feel about your progress?";
};
