// Old clients receive a clear response after the R2 migration.
export function POST() { return Response.json({ error: "Uploads moved to /api/uploads. Refresh the application." }, { status: 410 }); }
export const GET = POST;
