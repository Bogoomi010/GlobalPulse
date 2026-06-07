import { Env, json } from '../../_shared';

export const onRequestPost: PagesFunction<Env> = async () =>
  json({ error: 'Payment system has been removed from GlobalPulse.' }, 410);
