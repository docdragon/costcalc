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
        const { prompt, image, analyzeDimensions, configureFromText, text, analyzeStructure, dimensions } = request.body;
        
        // --- Handle Image Structure Analysis ---
        if (analyzeStructure) {
            if (!image || !image.data || !image.mimeType) {
                return response.status(400).json({ error: 'Yêu cầu phân tích cấu trúc thiếu hình ảnh.' });
            }
            if (!dimensions || !dimensions.l || !dimensions.w || !dimensions.h) {
                return response.status(400).json({ error: 'Yêu cầu phân tích cấu trúc thiếu kích thước tổng thể.' });
            }

            const structurePrompt = `
            BẠN LÀ AI: Một chuyên gia thiết kế nội thất và kỹ sư sản xuất đồ gỗ, chuyên phân tích bản vẽ và hình ảnh để bóc tách chi tiết.
            NHIỆM VỤ: Phân tích hình ảnh của một sản phẩm nội thất (ví dụ: tủ bếp, tủ áo) và tạo ra một danh sách chi tiết cấu thành dưới dạng JSON.
            BỐI CẢNH: Người dùng đã cung cấp một hình ảnh và kích thước tổng thể của sản phẩm (Dài, Rộng, Cao).
            KÍCH THƯỚC TỔNG THỂ: Dài=${dimensions.l}mm, Rộng=${dimensions.w}mm, Cao=${dimensions.h}mm.
    
            HƯỚNG DẪN CHI TIẾT:
            1.  **Xác định các chi tiết:** Dựa vào hình ảnh, xác định tất cả các chi tiết chính như: Hông Trái, Hông Phải, Đáy, Nóc, Hậu, Vách Ngăn, Cánh Mở, Đợt Cố Định, v.v.
            2.  **Ước tính Kích thước Chi tiết:** Dựa vào hình ảnh và kích thước tổng thể, ước tính 'length' (chiều dài) và 'width' (chiều rộng) cho mỗi chi tiết. Giả sử độ dày ván tiêu chuẩn là 17mm. Ví dụ, nếu tủ dài 1000mm, thì tấm đáy sẽ là 1000 - 17*2 = 966mm.
            3.  **Xác định Vị trí & Góc Xoay:**
                *   Hệ tọa độ có gốc (0,0,0) tại TÂM của khối hộp tổng thể.
                *   Trục X: Dọc theo chiều Dài.
                *   Trục Y: Dọc theo chiều Cao.
                *   Trục Z: Dọc theo chiều Rộng.
                *   Tính toán vị trí tâm ('x', 'y', 'z') và góc xoay ('rx', 'ry', 'rz') cho từng chi tiết để dựng lại mô hình 3D.
                *   Ví dụ:
                    *   Hông Trái: x = -Dài/2 + dày/2, y=0, z=0. ry=90.
                    *   Đáy: x=0, y=Cao/2 - dày/2, z=0. rx=90.
            4.  **Định dạng Đầu ra:** Trả về một MẢNG JSON. Mỗi phần tử trong mảng là một đối tượng đại diện cho một chi tiết. KHÔNG trả về bất cứ thứ gì khác ngoài mảng JSON.
            `;
    
            const promptParts = [
                { inlineData: { mimeType: image.mimeType, data: image.data } },
                { text: structurePrompt }
            ];
    
            const responseSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: 'Tên chi tiết, ví dụ: Hông Trái' },
                        length: { type: Type.INTEGER, description: 'Chiều dài của chi tiết (mm)' },
                        width: { type: Type.INTEGER, description: 'Chiều rộng của chi tiết (mm)' },
                        qty: { type: Type.INTEGER, description: 'Số lượng của chi tiết này' },
                        x: { type: Type.INTEGER, description: 'Vị trí tâm trên trục X (mm)' },
                        y: { type: Type.INTEGER, description: 'Vị trí tâm trên trục Y (mm)' },
                        z: { type: Type.INTEGER, description: 'Vị trí tâm trên trục Z (mm)' },
                        rx: { type: Type.INTEGER, description: 'Góc xoay quanh trục X (độ)' },
                        ry: { type: Type.INTEGER, description: 'Góc xoay quanh trục Y (độ)' },
                        rz: { type: Type.INTEGER, description: 'Góc xoay quanh trục Z (độ)' },
                    },
                    required: ["name", "length", "width", "qty", "x", "y", "z", "rx", "ry", "rz"]
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
                console.error("Serverless function (structure): Failed to parse JSON from Gemini.", parseError);
                console.error("Original text from Gemini:", genAIResponse.text);
                return response.status(500).json({ error: `Phản hồi từ AI không hợp lệ: ${genAIResponse.text}` });
            }
        }

        // --- Handle Form Configuration from Text Request ---
        if (configureFromText) {
            if (!text) {
                return response.status(400).json({ error: 'Yêu cầu cấu hình từ văn bản thiếu nội dung.' });
            }
            const configPrompt = `Bạn là một trợ lý AI chuyên nghiệp cho một xưởng mộc ở Việt Nam. Nhiệm vụ của bạn là đọc một mô tả sản phẩm bằng tiếng Việt và trích xuất các thông tin chi tiết vào một cấu trúc JSON.
- Phân tích văn bản để tìm 'length' (dài), 'width' (rộng), 'height' (cao), 'itemName' (tên sản phẩm), 'itemType' (loại sản phẩm), 'materialName' (tên vật liệu), và 'compartments' (số khoang/cánh).
- **Chuyển đổi đơn vị**: Chuyển đổi tất cả các đơn vị sang milimét (mm). Ví dụ: "2 mét", "2m", "2m2" -> 2000; "60 phân", "60cm" -> 600.
- **Loại sản phẩm (itemType)**: Phải là một trong các giá trị sau: 'tu-bep-duoi', 'tu-bep-tren', 'tu-ao', 'khac'.
- **Tên vật liệu (materialName)**: Trích xuất tên vật liệu chính được yêu cầu, ví dụ: "MDF An Cường", "HDF chống ẩm".
- **Số khoang (compartments)**: Trích xuất số lượng khoang hoặc cánh. Ví dụ: "3 cánh", "2 khoang" -> 3. Nếu không đề cập, mặc định là 1.
- Nếu không tìm thấy thông tin nào, hãy bỏ qua khóa đó. Chỉ trả về JSON.`;
            
            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    length: { type: Type.INTEGER, description: "Kích thước Dài (mm)" },
                    width: { type: Type.INTEGER, description: "Kích thước Rộng (mm)" },
                    height: { type: Type.INTEGER, description: "Kích thước Cao (mm)" },
                    itemName: { type: Type.STRING, description: "Tên sản phẩm được trích xuất" },
                    itemType: { type: Type.STRING, description: "Loại sản phẩm: 'tu-bep-duoi', 'tu-bep-tren', 'tu-ao', or 'khac'" },
                    materialName: { type: Type.STRING, description: "Tên của vật liệu ván chính" },
                    compartments: { type: Type.INTEGER, description: "Số lượng khoang hoặc cánh" }
                }
            };
            
            const genAIResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${configPrompt}\n\nVăn bản của người dùng: "${text}"`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                }
            });
            
            try {
                const parsedData = JSON.parse(genAIResponse.text);
                return response.status(200).json(parsedData);
            } catch (parseError) {
                console.error("Serverless function (config): Failed to parse JSON from Gemini.", parseError);
                console.error("Original text from Gemini:", genAIResponse.text);
                return response.status(500).json({ error: `Phản hồi từ AI không hợp lệ: ${genAIResponse.text}` });
            }
        }

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
                    cuttingLayout: {
                        type: Type.OBJECT,
                        properties: {
                            totalSheetsUsed: { type: Type.INTEGER, description: "Tổng số tấm ván CHÍNH được sử dụng, dựa trên sơ đồ cắt tối ưu." },
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
                    },
                    edgeBanding: {
                        type: Type.OBJECT,
                        properties: {
                            totalLength: { type: Type.INTEGER, description: "Tổng chiều dài nẹp cạnh cần thiết, tính bằng mm." },
                            reasoning: { type: Type.STRING, description: "Giải thích ngắn gọn về cách tính toán." }
                        },
                        required: ["totalLength"]
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

        return response.status(400).json({ error: 'Yêu cầu không hợp lệ. Thiếu "prompt", "configureFromText", "analyzeDimensions", hoặc "analyzeStructure".' });

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