import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const getUniversitySuggestions = async (params: {
  budget: number;
  major: string;
  academicStanding: string;
  interests: string[];
}) => {
  const prompt = `Suggest exactly 10 diverse and top-tier universities in Australia, New Zealand, US, Hong Kong, or UK for a student with:
  - Budget: Under $${params.budget} per year (Tuition + basic living)
  - Planned Major: ${params.major}
  - Academic Standing: ${params.academicStanding}
  - Interests: ${params.interests.join(', ')}
  
  Please ensure a mix of locations across the 5 target regions.
  For each university, provide:
  - Name
  - Country
  - Location (City)
  - Why it fits (specific to the major and student profile)
  - Estimated Tuition Fee (as a number in USD)
  - Entry Requirements (A-Level focus, e.g., AAA, A*AA)
  - Potential Scholarships (list of 2-3 specific ones)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            country: { type: Type.STRING },
            location: { type: Type.STRING },
            fitReason: { type: Type.STRING },
            tuitionFee: { type: Type.NUMBER },
            entryRequirements: { type: Type.STRING },
            scholarships: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["name", "country", "location", "fitReason", "tuitionFee", "entryRequirements", "scholarships"],
        },
      },
    },
  });

  return JSON.parse(response.text);
};

export const getMajorSuggestions = async (params: {
  cvSummary: string;
  academicStanding: string;
  interests: string[];
  financialStatement: string;
}) => {
  const prompt = `Suggest 3 suitable majors for a student based on:
  - CV Summary: ${params.cvSummary}
  - Academic Standing: ${params.academicStanding}
  - Interests: ${params.interests.join(', ')}
  - Financial Situation: ${params.financialStatement}
  
  Provide a reason for each suggestion.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            major: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ["major", "reason"],
        },
      },
    },
  });

  return JSON.parse(response.text);
};

export const getApplicationPlan = async (universityName: string, major: string, country: string) => {
  const prompt = `Create a detailed application timeline and checklist for ${major} at ${universityName}, ${country} for an A-Level student.
  Include:
  - Preparation steps (exams, portfolio, etc.)
  - Documents needed
  - Typical deadlines
  - Specific things to look for
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            deadline: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['preparation', 'submission', 'follow-up'] },
          },
          required: ["title", "description", "deadline", "category"],
        },
      },
    },
  });

  return JSON.parse(response.text);
};
