export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'Image data missing' });
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'HF_TOKEN not configured on Vercel' });
  }

  try {
    const buffer = Buffer.from(imageBase64, 'base64');

    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/briaai/RMBG-1.4",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        method: "POST",
        body: buffer,
      }
    );

    if (!hfResponse.ok) {
      const err = await hfResponse.text();
      return res.status(hfResponse.status).json({ error: err });
    }

    const outputBuffer = await hfResponse.arrayBuffer();
    res.setHeader("Content-Type", "image/png");
    return res.send(Buffer.from(outputBuffer));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
