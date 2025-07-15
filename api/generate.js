import { GoogleGenAI, Type } from "@google/genai";

// This is a Vercel Serverless Function.
// It must be placed in the /api directory.
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Phương thức không được phép' });
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: 'Lỗi: Biến môi trường API_KEY không được cấu hình trên máy chủ.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    try {
        const { prompt } = request.body;
        
        if (prompt) {
            const promptParts = [{ text: prompt }];
            
            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    cuttingLayout: {
                        type: Type.OBJECT,
                        description: "Sơ đồ cắt ván tối ưu.",
                        properties: {
                            totalSheetsUsed: { type: Type.INTEGER, description: "Tổng số tấm ván CHÍNH được sử dụng." },
                            sheets: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        sheetNumber: { type: Type.INTEGER },
                                        pieces: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    name: { type: Type.STRING },
                                                    x: { type: Type.INTEGER },
                                                    y: { type: Type.INTEGER },
                                                    width: { type: Type.INTEGER },
                                                    height: { type: Type.INTEGER }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const genAIResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: promptParts },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                }
            });

            try {
                const parsedData = JSON.parse(genAIResponse.text);
                return response.status(200).json(parsedData);
            } catch(parseError) {
                console.error("Serverless function: Failed to parse JSON from Gemini response.", parseError);
                console.error("Original text from Gemini:", genAIResponse.text);
                return response.status(500).json({ error: `Phản hồi từ AI không phải là JSON hợp lệ. Nội dung: ${genAIResponse.text}`});
            }
        } else {
             return response.status(400).json({ error: 'Yêu cầu không hợp lệ. Chỉ chấp nhận yêu cầu "prompt" để tối ưu cắt ván.' });
        }

    } catch (error) {
        console.error("Error in serverless function:", error);
        const errorMessage = error.message || "Đã xảy ra lỗi không xác định trên máy chủ.";
        if (!response.headersSent) {
            response.status(500).json({ error: `Lỗi nội bộ máy chủ: ${errorMessage}` });
        } else {
             response.end();
        }
    }
}