import { AwsClient } from 'aws4fetch';

function config() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const bucket = process.env.OBJECT_STORAGE_BUCKET || 'plot-to-ghar';
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error('Neon Object Storage is not configured');
  }
  return {
    accessKeyId,
    secretAccessKey,
    endpoint: endpoint.replace(/\/$/, ''),
    bucket,
    region: process.env.AWS_REGION || 'us-east-2',
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };
}

function objectUrl(pathname: string) {
  const c = config();
  const encoded = pathname.split('/').map(encodeURIComponent).join('/');
  return `${c.endpoint}/${encodeURIComponent(c.bucket)}/${encoded}`;
}

function client() {
  const c = config();
  return new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    sessionToken: c.sessionToken,
    region: c.region,
    service: 's3',
  });
}

export async function putObject(pathname: string, body: ArrayBuffer, contentType: string) {
  const response = await client().fetch(objectUrl(pathname), {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!response.ok) {
    throw new Error(`Object upload failed (${response.status})`);
  }
  return { pathname };
}

export async function getObject(pathname: string) {
  const response = await client().fetch(objectUrl(pathname), { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Object read failed (${response.status})`);
  return response;
}
