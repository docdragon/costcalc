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
        const { prompt, image, chatHistory, newChatMessage, analyzeDimensions } = request.body;
        
        // --- Handle Image Dimension Analysis Request ---
        if (analyzeDimensions) {
            if (!image || !image.data || !image.mimeType) {
                return response.status(400).json({ error: 'Yêu cầu phân tích kích thước thiếu hình ảnh.' });
            }

            const dimensionPrompt = `Bạn là một trợ lý AI thông minh chuyên phân tích các bản vẽ kỹ thuật, bản thiết kế và bản phác thảo tay của đồ nội thất cho một xưởng mộc ở Việt Nam. Nhiệm vụ của bạn là kiểm tra kỹ lưỡng hình ảnh được cung cấp và trích xuất các kích thước chính: length (Dài), width (Rộng), và height (Cao).
- Các kích thước gần như luôn ở đơn vị milimét (mm).
- Các giá trị có thể được viết bên cạnh các đường kích thước hoặc trực tiếp trên các bộ phận.
- Ưu tiên các kích thước tổng thể của toàn bộ sản phẩm đồ nội thất.
- Nếu bạn tìm thấy các giá trị như '1m2', hãy chuyển đổi nó thành '1200'.
- CHỈ trả về một đối tượng JSON chứa các số bạn tìm thấy.
- Nếu một kích thước cụ thể (dài, rộng, hoặc cao) không được tìm thấy hoặc không rõ ràng, hãy bỏ qua khóa của nó trong đối tượng JSON. Không đoán hoặc ước tính. Không bao gồm đơn vị trong đầu ra JSON.
Ví dụ phản hồi: {\"length\": 1200, \"height\": 750}`;

            const promptParts = [
                { inlineData: { mimeType: image.mimeType, data: image.data } },
                { text: dimensionPrompt }
            ];

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    length: { type: Type.INTEGER, description: "Kích thước Dài đã trích xuất (mm)" },
                    width: { type: Type.INTEGER, description: "Kích thước Rộng đã trích xuất (mm)" },
                    height: { type: Type.INTEGER, description: "Kích thước Cao đã trích xuất (mm)" },
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
            } catch (parseError) {
                console.error("Serverless function (dimensions): Failed to parse JSON from Gemini.", parseError);
                console.error("Original text from Gemini:", genAIResponse.text);
                return response.status(500).json({ error: `Phản hồi từ AI không hợp lệ: ${genAIResponse.text}` });
            }
        }


        // --- Handle Chat Request (Streaming) ---
        if (newChatMessage) {
            let systemInstruction = null;
            let userAndModelHistory = chatHistory;

            const systemMessageIndex = chatHistory.findIndex(msg => msg.role === 'system');
            if (systemMessageIndex !== -1) {
                systemInstruction = chatHistory[systemMessageIndex]?.parts?.[0]?.text;
                userAndModelHistory = chatHistory.filter(msg => msg.role !== 'system');
            }
            
            const config = {};
            if (systemInstruction) {
                config.systemInstruction = systemInstruction;
            }

            // Set headers for streaming
            response.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            });

            const streamResult = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: userAndModelHistory,
                config: config
            });

            for await (const chunk of streamResult) {
                response.write(chunk.text);
            }
            response.end();
            return; // End the function after streaming is complete
        }

        // --- Handle Calculator Request (JSON with Schema) ---
        if (prompt) {
             const promptParts = [];
            if (image && image.data && image.mimeType) {
                promptParts.push({
                    inlineData: {
                        mimeType: image.mimeType,
                        data: image.data,
                    },
                });
            }
            promptParts.push({ text: prompt });
            
            // Define the strict schema for the JSON response
            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    costBreakdown: {
                        type: Type.OBJECT,
                        properties: {
                            materialCosts: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { name: { type: Type.STRING }, cost: { type: Type.NUMBER }, reason: { type: Type.STRING } }
                                }
                            },
                            hiddenCosts: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { name: { type: Type.STRING }, cost: { type: Type.NUMBER }, reason: { type: Type.STRING } }
                                }
                            },
                            totalCost: { type: Type.NUMBER },
                            suggestedPrice: { type: Type.NUMBER },
                            estimatedProfit: { type: Type.NUMBER }
                        }
                    },
                    aiSuggestions: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { type: { type: Type.STRING }, text: { type: Type.STRING } }
                                }
                            }
                        }
                    },
                    cuttingLayout: {
                        type: Type.OBJECT,
                        properties: {
                            totalSheetsUsed: { type: Type.INTEGER },
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
        }

        return response.status(400).json({ error: 'Yêu cầu không hợp lệ. Thiếu "prompt", "newChatMessage", hoặc "analyzeDimensions".' });

    } catch (error) {
        console.error("Error in serverless function:", error);
        const errorMessage = error.message || "Đã xảy ra lỗi không xác định trên máy chủ.";
        // Avoid sending a response if headers already sent (for streaming errors)
        if (!response.headersSent) {
            response.status(500).json({ error: `Lỗi nội bộ máy chủ: ${errorMessage}` });
        } else {
             response.end(); // Gracefully end the stream on error
        }
    }
}