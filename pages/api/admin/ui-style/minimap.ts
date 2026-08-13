import fs from 'fs/promises';
import path from 'path';

const STYLE_PATH = path.join(process.cwd(), 'public', 'config', 'minimap-style.json');

const readStyle = async () => {
  try {
    const raw = await fs.readFile(STYLE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

const writeStyle = async (data: unknown) => {
  await fs.mkdir(path.dirname(STYLE_PATH), { recursive: true });
  await fs.writeFile(STYLE_PATH, JSON.stringify(data, null, 2));
};

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    try {
      const data = await readStyle();
      if (!data) {
        res.status(404).json({ error: 'Style not found' });
        return;
      }
      res.status(200).json(data);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to read style' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      await writeStyle(payload);
      res.status(200).json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save style' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
