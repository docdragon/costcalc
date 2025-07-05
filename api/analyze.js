// api/analyze.js
import { GoogleGenAI } from "@google/genai";

// Hàm handler chính cho Serverless Function
export default async function handler(req, res) {
    // Chỉ cho phép phương thức POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    // Lấy khóa API từ biến môi trường của Vercel
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key is not configured on the server.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
        const { prompt, image } = req.body;

        if (!prompt) {
             return res.status(400).json({ error: 'Prompt is required.' });
        }

        // Xây dựng các phần của yêu cầu
        const parts = [];
        if (image && image.data && image.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                },
            });
        }
        parts.push({ text: prompt });

        // Tạo yêu cầu với cấu trúc 'contents' đã được sửa lỗi
        const request = {
            model: 'gemini-2.5-flash-preview-04-17',
            contents: [{ parts: parts }], // SỬA LỖI: `contents` phải là một mảng các đối tượng Content
        };
        
        const response = await ai.models.generateContent(request);

        // Gửi kết quả về cho client
        res.status(200).json({ text: response.text });

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ error: 'Failed to call Gemini API.', details: error.message });
    }
}
