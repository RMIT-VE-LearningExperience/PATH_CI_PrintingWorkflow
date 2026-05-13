"use client";

import Link from "next/link";
import { Box, Stack, Typography } from "@mui/material";

export default function NotFound() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#FDF9F1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ textAlign: "center", px: 3 }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 700, color: "#45443F" }}
        >
          Page not found
        </Typography>
        <Typography variant="body1" sx={{ color: "#62615C" }}>
          This link is no longer available or has been removed.
        </Typography>
        <Box
          component={Link}
          href="/"
          sx={{
            display: "inline-block",
            bgcolor: "#3D8078",
            color: "#fff",
            fontWeight: 700,
            fontSize: "1rem",
            textDecoration: "none",
            borderRadius: 2,
            px: 3,
            py: 1,
            "&:hover": { bgcolor: "#45443F" },
          }}
        >
          Back to Homepage
        </Box>
      </Stack>
    </Box>
  );
}
