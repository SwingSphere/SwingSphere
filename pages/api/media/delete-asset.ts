import { deleteMediaAsset } from '../../../lib/media/serverActions';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const payload = await deleteMediaAsset(body, req.headers.authorization);
    res.status(200).json(payload);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to delete media asset.' });
  }
}
