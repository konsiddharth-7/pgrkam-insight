import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';


const app = express();
const port = process.env.PORT || 5001;
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: frontendOrigin }));


app.use(express.json({ limit: '100kb' }));


app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'pgrkam-insight-api' });
});




app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`PGRKAM Insight API listening on port ${port}`);
});

export default app;