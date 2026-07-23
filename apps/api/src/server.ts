import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';

// Menginisiasi instance Fastify dengan logger bawaan (Pino)
const app: FastifyInstance = Fastify({
  logger: process.env.NODE_ENV === 'production' ? true : {
    transport: {
      target: 'pino-pretty', // Pastikan Anda menginstal pino-pretty di devDependencies
    },
  },
});

const startServer = async () => {
  try {
    // 1. Daftarkan Global Plugins (CORS)
    await app.register(cors, {
      origin: true, // Sesuaikan dengan domain frontend jika sudah di-deploy terpisah
      credentials: true,
    });

    // 2. Daftarkan API Routes Anda (Sesuai dengan PRD, memiliki awalan /api/v1)
    // Idealnya kode route dipisah ke file src/app.ts lalu di-import ke sini.
    app.get('/api/v1/health', async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        success: true,
        data: { message: 'Sistem Personal OS Kendali Berjalan Normal', timestamp: new Date() },
      });
    });

    // 3. Konfigurasi Frontend Vite (HANYA BERJALAN SAAT PRODUCTION / DI DALAM DOCKER)
    if (process.env.NODE_ENV === 'production') {
      // Mengarahkan path ke folder hasil build Vite (apps/web/dist)
      // Karena file ini nantinya berada di apps/api/dist/server.js, kita naik 2 tingkat
      const frontendDistPath = path.join(__dirname, '../../web/dist');

      await app.register(fastifyStatic, {
        root: frontendDistPath,
        prefix: '/', // Frontend disajikan di rute utama
      });

      // 4. Global Error / Not Found Handler
      app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
        // Jika request berawalan /api, berarti user salah ketik endpoint API
        if (request.url.startsWith('/api/')) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Endpoint ${request.method} ${request.url} tidak ditemukan`,
            },
          });
        } else {
          // Jika request BUKAN /api (misal user ketik /dashboard atau refresh browser),
          // kembalikan file index.html agar React Router di frontend yang menanganinya.
          reply.sendFile('index.html');
        }
      });
    } else {
      // Handler 404 sederhana untuk mode Development (tanpa frontend statis)
      app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
        reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
      });
    }

    // 5. Jalankan Server
    const port = Number(process.env.PORT) || 3000;
    
    // PERHATIAN: host '0.0.0.0' hukumnya WAJIB agar Docker tidak memblokir akses jaringan
    await app.listen({ port: port, host: '0.0.0.0' });

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Eksekusi fungsi startup
startServer();