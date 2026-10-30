import { body, context, handler, json, requireNotViewer, type Params } from '@/lib/api';
import { db } from '@/lib/db';
import { noteInput } from '@/lib/schemas';
import { addNote } from '@/lib/tasks';

export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireNotViewer(c);
  const { text } = await body(req, noteInput);
  return json(await addNote(db(), { id: c.me.id, isLead: c.isLead, isViewer: c.isViewer }, id, text), 201);
});
