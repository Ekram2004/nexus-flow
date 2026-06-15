import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


export async function verifyMatch(bankTx: any,
    internalTx: any
) {
    const prompt = `
    You are an expert financial accountant.
    Compare these two transactions and decide if they are a match.
    
    Bank Transaction: ${JSON.stringify(bankTx)}
    Internal Record: ${JSON.stringify(internalTx)}
    
    Output JSON: {"isMatch": boolean, "reason": string}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content!)
}