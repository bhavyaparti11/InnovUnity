require("dotenv").config();
const axios = require("axios");

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function askAI(prompt) {
    try {
        const res = await axios.post(
            API_URL,
            {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: prompt }]
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return res.data.choices[0].message.content;
    } catch (error) {
        console.error("Groq Error:", error.response ? error.response.data : error.message);
        return "Error: AI could not process this request.";
    }
}

async function reviewCode(code) { 
    return await askAI(`You are a senior developer reviewing code. Be extremely concise. In bullet points, list only the most critical bugs and one brief improvement suggestion. Keep it under 4 sentences total:\n\n${code}`); 
}

async function explainCode(code) { 
    return await askAI(`Explain this code very briefly and simply for a beginner in 2 or 3 sentences max:\n\n${code}`); 
}

module.exports = { reviewCode, explainCode };