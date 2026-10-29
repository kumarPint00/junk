import type { VercelRequest, VercelResponse } from '@vercel/node';
export default function handler(_req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,service:'plot-to-ghar',version:'1.0.0',time:new Date().toISOString()});
}
