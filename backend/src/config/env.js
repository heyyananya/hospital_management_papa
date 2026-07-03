/**
 * Centralised environment variable reader.
 * Throws early if required values are missing so misconfig is loud, not silent.
 */
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  PG: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'dcms',
  },

  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',

  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  UPLOAD_MAX_MB: parseInt(process.env.UPLOAD_MAX_MB || '10', 10),
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'src/uploads',

  ADMIN: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
    fullName: process.env.ADMIN_FULLNAME || 'Dr. Ajit',
  },

  PRINT: {
    letterpadPath: process.env.LETTERPAD_PATH || 'src/uploads/letterpad/letterpad.pdf',
    // Margins below match the Fefsa Hospital letterpad empty window:
    //  - top ~165pt clears the header bar + "Asthma | Cough …" tagline strip
    //  - left ~50pt clears the blue side bar
    //  - bottom ~75pt clears the address/contact footer
    marginTop: parseInt(process.env.PRINT_MARGIN_TOP || '165', 10),
    marginLeft: parseInt(process.env.PRINT_MARGIN_LEFT || '50', 10),
    marginRight: parseInt(process.env.PRINT_MARGIN_RIGHT || '30', 10),
    marginBottom: parseInt(process.env.PRINT_MARGIN_BOTTOM || '75', 10),
  },
};
