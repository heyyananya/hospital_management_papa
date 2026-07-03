import { Box, Typography, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function NotFound() {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant="h2" sx={{ color: 'text.secondary' }}>404</Typography>
      <Typography sx={{ mb: 3 }}>The page you are looking for does not exist.</Typography>
      <Button component={RouterLink} to="/" variant="contained">Back to Dashboard</Button>
    </Box>
  );
}
