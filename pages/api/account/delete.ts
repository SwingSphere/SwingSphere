import { deleteAuthenticatedAccount } from '../../../lib/accountDeletionServer';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const payload = await deleteAuthenticatedAccount(req.headers?.authorization);
    res.status(200).json(payload);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Account deletion failed.' });
  }
}
