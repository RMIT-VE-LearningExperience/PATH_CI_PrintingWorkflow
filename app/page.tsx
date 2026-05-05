"use client";

import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Fab,
  Grid,
  Link,
  Modal,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Home as HomeIcon,
  Image as ImageIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "./components/GoogleAnalytics";
import Footer from "./components/Footer";
import type { Item, Level, RelationshipEntry, Step, TutorialState } from "../lib/tutorial-store";

// ── Constants ─────────────────────────────────────────────────────────

const PROGRESS_KEY = "path_guide_progress_v1";

const colors = {
  primary: "#3D8078",
  darkBg: "#45443F",
  lightBg: "#FDF9F1",
  text: "#45443F",
  lightText: "#62615C",
  cardShadow: "0 2px 8px rgba(69,68,63,0.08)",
  cardShadowHover: "0 8px 16px rgba(69,68,63,0.12)",
};

// ── Helpers ───────────────────────────────────────────────────────────

function getVideoEmbedUrl(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return url;
  return null;
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<(?!\/?(p|br|ul|ol|li|b|strong|i|em|h3|a)(\s+[^>]*)?>)[^>]*>/gi, "")
    .replace(/<a\s+[^>]*href=(\"|')(.*?)\1[^>]*>/gi, (_m, _q, href: string) => {
      const safe = /^(https?:\/\/|mailto:)/i.test(href) ? href : "#";
      return `<a href="${safe}" target="_blank" rel="noreferrer">`;
    });
}

// ── Item card ─────────────────────────────────────────────────────────

function ItemCard({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <Card
      sx={{
        boxShadow: colors.cardShadow,
        transition: "box-shadow 0.2s, transform 0.2s",
        "&:hover": { boxShadow: colors.cardShadowHover, transform: "translateY(-2px)" },
        bgcolor: "#fff",
      }}
    >
      <CardActionArea onClick={onClick}>
        <Box
          sx={{
            aspectRatio: "4/3",
            bgcolor: "grey.100",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {item.thumbnailUrl ? (
            <CardMedia
              component="img"
              image={item.thumbnailUrl}
              alt={item.name}
              sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <ImageIcon sx={{ fontSize: 56, color: "grey.300" }} />
          )}
        </Box>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} color={colors.text}>
            {item.name}
          </Typography>
          {item.description && (
            <Typography variant="body2" color={colors.lightText} sx={{ mt: 0.5 }}>
              {item.description}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

type NavEntry = { levelId: string; itemId: string };

export default function HomePage() {
  const [state, setAppState] = useState<TutorialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [selectionStack, setSelectionStack] = useState<NavEntry[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastTrackedStep = useRef(-1);

  // ── Derived ─────────────────────────────────────────────────────────

  const activeLevels = useMemo(
    (): Level[] =>
      (state?.hierarchy.levels ?? [])
        .filter((l) => l.enabled)
        .sort((a, b) => a.order - b.order),
    [state],
  );

  const atSteps = selectionStack.length === activeLevels.length && activeLevels.length > 0;
  const currentLevel: Level | undefined = atSteps ? undefined : activeLevels[selectionStack.length];
  const parentEntry = selectionStack.length > 0 ? selectionStack[selectionStack.length - 1] : null;
  const parentLevel: Level | undefined =
    selectionStack.length > 0 ? activeLevels[selectionStack.length - 1] : undefined;

  const visibleItems = useMemo((): Item[] => {
    if (!state || !currentLevel) return [];
    const all = state.items[currentLevel.id] ?? [];
    if (selectionStack.length === 0) return all;
    const rels = (state.relationships[parentLevel!.id]?.[parentEntry!.itemId] ?? []).slice();
    rels.sort((a, b) => (a as RelationshipEntry).order - (b as RelationshipEntry).order);
    return rels
      .map((r) => all.find((i) => i.id === (r as RelationshipEntry).childItemId))
      .filter(Boolean) as Item[];
  }, [state, currentLevel, selectionStack, parentLevel, parentEntry]);

  const currentSteps = useMemo((): Step[] => {
    if (!state || !atSteps || !parentEntry) return [];
    return state.steps[parentEntry.itemId] ?? [];
  }, [state, atSteps, parentEntry]);

  // ── Data loading ─────────────────────────────────────────────────────

  useEffect(() => {
    async function loadData() {
      try {
        const params = new URLSearchParams(window.location.search);
        const previewToken = params.get("previewToken");

        const url = previewToken
          ? `/api/tutorial?previewToken=${encodeURIComponent(previewToken)}`
          : "/api/tutorial";

        const res = await fetch(url, { cache: "no-store" });
        const result = (await res.json()) as
          | { state: TutorialState; isPreviewMode?: boolean }
          | { error: string };

        if (!res.ok || "error" in result) {
          setError("Could not load guide data.");
          return;
        }

        const { state: newState, isPreviewMode: preview } = result as {
          state: TutorialState;
          isPreviewMode?: boolean;
        };

        setAppState(newState);
        setIsPreviewMode(!!preview);

        const levels = (newState.hierarchy.levels ?? [])
          .filter((l) => l.enabled)
          .sort((a, b) => a.order - b.order);

        if (preview) {
          // Preview mode: restore from URL params
          const previewSelections: NavEntry[] = [];
          for (let i = 0; i < levels.length; i++) {
            const idParam = params.get(`l${i + 1}`);
            if (!idParam) break;
            previewSelections.push({ levelId: levels[i].id, itemId: idParam });
          }
          if (previewSelections.length > 0) setSelectionStack(previewSelections);
          return;
        }

        // Deep link: l1/l2/l3 params (all levels)
        if (params.get("l1")) {
          const publicSelections: NavEntry[] = [];
          for (let i = 0; i < levels.length; i++) {
            const idParam = params.get(`l${i + 1}`);
            if (!idParam) break;
            const matched = (newState.items[levels[i].id] ?? []).find((item) => item.id === idParam);
            if (!matched) break;
            publicSelections.push({ levelId: levels[i].id, itemId: matched.id });
          }
          if (publicSelections.length > 0) setSelectionStack(publicSelections);
          return;
        }

        // Deep link: legacy ?[level1_singular]=slug
        const level1 = levels[0];
        if (level1) {
          const slugParam = params.get(level1.singularName.toLowerCase());
          if (slugParam) {
            const matched = (newState.items[level1.id] ?? []).find((i) => i.slug === slugParam);
            if (matched) {
              setSelectionStack([{ levelId: level1.id, itemId: matched.id }]);
            } else {
              setNotFound(true);
            }
            return;
          }
        }

        // Restore from localStorage
        try {
          const stored = window.localStorage.getItem(PROGRESS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as { selections?: NavEntry[] };
            if (parsed.selections?.length) {
              // Validate all saved IDs still exist
              const valid = parsed.selections.every((entry, i) => {
                const level = levels[i];
                return level && (newState.items[level.id] ?? []).some((item) => item.id === entry.itemId);
              });
              if (valid) setSelectionStack(parsed.selections);
            }
          }
        } catch { /* ignore */ }
      } catch {
        setError("Could not load guide data.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  // ── Scroll / back-to-top ──────────────────────────────────────────────

  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 400);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Step intersection observer ────────────────────────────────────────

  useEffect(() => {
    if (!atSteps || currentSteps.length === 0) return;
    lastTrackedStep.current = -1;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = stepRefs.current.indexOf(entry.target as HTMLDivElement);
          if (idx < 0 || idx <= lastTrackedStep.current) continue;

          lastTrackedStep.current = idx;
          setActiveStepIndex(idx);

          const step = currentSteps[idx];
          if (step) {
            trackEvent("view_step", {
              step_number: idx + 1,
              step_title: step.title,
            });
          }

          if (idx === currentSteps.length - 1) {
            trackEvent("complete_guide", { total_steps: currentSteps.length });
          }
        }
      },
      { threshold: 0.5 },
    );

    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [atSteps, currentSteps]);

  // ── Navigation ────────────────────────────────────────────────────────

  const saveProgress = useCallback(
    (stack: NavEntry[]) => {
      if (isPreviewMode) return;
      try {
        window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ selections: stack }));
      } catch { /* ignore */ }
    },
    [isPreviewMode],
  );

  function handleSelect(item: Item, levelId: string) {
    const newStack = [...selectionStack, { levelId, itemId: item.id }];
    setSelectionStack(newStack);
    setActiveStepIndex(0);
    stepRefs.current = [];
    lastTrackedStep.current = -1;

    if (!isPreviewMode) {
      const url = new URL(window.location.pathname, window.location.origin);
      newStack.forEach((entry, i) => {
        url.searchParams.set(`l${i + 1}`, entry.itemId);
      });
      window.history.replaceState({}, "", url.toString());
    }

    // GA event
    trackEvent(`select_${activeLevels.find((l) => l.id === levelId)?.singularName?.toLowerCase() ?? "item"}`, {
      name: item.name,
      id: item.id,
    });

    saveProgress(newStack);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack(targetDepth: number) {
    const newStack = selectionStack.slice(0, targetDepth);
    setSelectionStack(newStack);

    if (!isPreviewMode) {
      const url = new URL(window.location.pathname, window.location.origin);
      newStack.forEach((entry, i) => {
        url.searchParams.set(`l${i + 1}`, entry.itemId);
      });
      window.history.replaceState({}, "", url.toString());
    }

    saveProgress(newStack);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Section heading ───────────────────────────────────────────────────

  function renderSectionHeading(level: Level | undefined) {
    if (!level?.sectionTitle && !level?.sectionSubtitle) return null;
    return (
      <Box sx={{ mb: 3 }}>
        {level.sectionTitle && (
          <Typography variant="h5" fontWeight={700} color={colors.text}>
            {level.sectionTitle}
          </Typography>
        )}
        {level.sectionSubtitle && (
          <Typography variant="body1" color={colors.lightText} sx={{ mt: 0.5 }}>
            {level.sectionSubtitle}
          </Typography>
        )}
      </Box>
    );
  }

  // ── Breadcrumbs ───────────────────────────────────────────────────────

  function renderBreadcrumbs() {
    if (!state || selectionStack.length === 0) return null;
    return (
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component="button"
          variant="body2"
          onClick={() => handleBack(0)}
          underline="hover"
          sx={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 0.5 }}
        >
          <HomeIcon sx={{ fontSize: 16 }} />
          {activeLevels[0]?.name ?? "Home"}
        </Link>
        {selectionStack.slice(0, -1).map((entry, i) => {
          const level = activeLevels[i];
          const item = (state.items[level?.id ?? ""] ?? []).find((it) => it.id === entry.itemId);
          return (
            <Link
              key={entry.itemId}
              component="button"
              variant="body2"
              onClick={() => handleBack(i + 1)}
              underline="hover"
              sx={{ cursor: "pointer" }}
            >
              {item?.name ?? entry.itemId}
            </Link>
          );
        })}
        {(() => {
          const last = selectionStack[selectionStack.length - 1];
          const level = activeLevels[selectionStack.length - 1];
          const item = (state.items[level?.id ?? ""] ?? []).find((it) => it.id === last.itemId);
          return (
            <Typography variant="body2" color="text.primary">
              {item?.name ?? last.itemId}
            </Typography>
          );
        })()}
      </Breadcrumbs>
    );
  }

  // ── Steps view ────────────────────────────────────────────────────────

  function renderSteps() {
    if (!atSteps) return null;
    const parentName = (() => {
      if (!state || !parentEntry) return "";
      const level = parentLevel;
      const item = (state.items[level?.id ?? ""] ?? []).find((i) => i.id === parentEntry.itemId);
      return item?.name ?? "";
    })();

    return (
      <Box>
        {renderBreadcrumbs()}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => handleBack(selectionStack.length - 1)}
          sx={{ textTransform: "none", mb: 2, color: colors.text }}
        >
          Back to {parentLevel?.name}
        </Button>

        {/* Sticky step counter */}
        {currentSteps.length > 0 && (
          <Box
            sx={{
              position: "sticky",
              top: 0,
              bgcolor: "rgba(253,249,241,0.95)",
              backdropFilter: "blur(4px)",
              zIndex: 10,
              py: 1.25,
              mb: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Container maxWidth="lg">
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" fontWeight={600} color={colors.primary}>
                  {parentName}
                </Typography>
                <Divider orientation="vertical" flexItem />
                <Typography variant="body2" color={colors.lightText}>
                  Step {activeStepIndex + 1} of {currentSteps.length}
                </Typography>
              </Stack>
            </Container>
          </Box>
        )}

        {currentSteps.length === 0 && (
          <Typography color={colors.lightText}>No steps have been added yet.</Typography>
        )}

        <Stack spacing={3}>
          {currentSteps.map((step, index) => {
            const embedUrl = step.videoUrl ? getVideoEmbedUrl(step.videoUrl) : null;
            return (
              <Paper
                key={step.id}
                ref={(el) => {
                  stepRefs.current[index] = el;
                }}
                sx={{ p: { xs: 2, md: 3 }, boxShadow: colors.cardShadow, bgcolor: "#fff" }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                  <Chip
                    label={index + 1}
                    size="small"
                    sx={{ bgcolor: colors.primary, color: "#fff", fontWeight: 700 }}
                  />
                  <Typography variant="h6" fontWeight={700} color={colors.text}>
                    {step.title}
                  </Typography>
                </Stack>

                {step.contentHtml && (
                  <Typography
                    component="div"
                    variant="body1"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(step.contentHtml) }}
                    sx={{
                      mb: 2,
                      color: colors.lightText,
                      "& a": { color: colors.primary },
                      "& ul, & ol": { pl: 2.5 },
                    }}
                  />
                )}

                {embedUrl ? (
                  <Box sx={{ position: "relative", paddingTop: "56.25%", borderRadius: 1, overflow: "hidden" }}>
                    <iframe
                      src={embedUrl}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        border: "none",
                      }}
                      allowFullScreen
                      loading="lazy"
                    />
                  </Box>
                ) : step.imageUrl ? (
                  <Box
                    component="img"
                    src={step.imageUrl}
                    alt={step.title}
                    onClick={() => setEnlargedImage(step.imageUrl)}
                    sx={{
                      width: "100%",
                      borderRadius: 1,
                      cursor: "zoom-in",
                      display: "block",
                      maxHeight: 480,
                      objectFit: "contain",
                    }}
                  />
                ) : null}
              </Paper>
            );
          })}
        </Stack>
      </Box>
    );
  }

  // ── Selection view ────────────────────────────────────────────────────

  function renderSelection() {
    if (atSteps || !state || !currentLevel) return null;
    const isLevel1 = selectionStack.length === 0;

    return (
      <Box>
        {/* Homepage fields — only at Level 1 */}
        {isLevel1 && (state.homepageTitle || state.homepageDescription) && (
          <Box sx={{ mb: 4, textAlign: "center" }}>
            {state.homepageTitle && (
              <Typography variant="h4" fontWeight={700} color={colors.text} gutterBottom>
                {state.homepageTitle}
              </Typography>
            )}
            {state.homepageDescription && (
              <Typography variant="body1" color={colors.lightText} sx={{ maxWidth: 600, mx: "auto" }}>
                {state.homepageDescription}
              </Typography>
            )}
          </Box>
        )}

        {!isLevel1 && (
          <>
            {renderBreadcrumbs()}
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => handleBack(selectionStack.length - 1)}
              sx={{ textTransform: "none", mb: 2, color: colors.text }}
            >
              Back to {activeLevels[selectionStack.length - 1]?.name}
            </Button>
          </>
        )}

        {renderSectionHeading(currentLevel)}

        {visibleItems.length === 0 ? (
          <Typography color={colors.lightText}>
            No items available yet.
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {visibleItems.map((item) => (
              <Grid item key={item.id} xs={12} sm={6} md={4}>
                <ItemCard item={item} onClick={() => handleSelect(item, currentLevel.id)} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────

  if (!loading && notFound) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: colors.lightBg }}>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", py: 8 }}>
          <Stack alignItems="center" spacing={2}>
            <Typography variant="h5" fontWeight={700} color={colors.text}>
              Item not found
            </Typography>
            <Typography color={colors.lightText}>
              The requested item could not be found or is not published.
            </Typography>
            <Button
              startIcon={<HomeIcon />}
              variant="contained"
              href="/"
              sx={{ textTransform: "none", bgcolor: colors.primary, "&:hover": { bgcolor: "#326b64" } }}
            >
              Go to home
            </Button>
          </Stack>
        </Box>
        <Footer year={new Date().getFullYear()} isAdmin={false} />
      </Box>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: colors.lightBg }}>
      {/* Preview banner */}
      {isPreviewMode && (
        <Alert
          severity="warning"
          sx={{
            borderRadius: 0,
            "& .MuiAlert-message": { fontWeight: 500 },
          }}
        >
          Preview mode — unpublished content is visible. This URL will expire in 3 hours.
        </Alert>
      )}

      {/* Content */}
      <Box sx={{ flex: 1 }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 12 }}>
            <CircularProgress sx={{ color: colors.primary }} />
          </Box>
        )}

        {!loading && error && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 12 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {!loading && !error && state && !state.hierarchyConfigured && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 12 }}>
            <Alert severity="info">This guide is not yet configured.</Alert>
          </Box>
        )}

        {!loading && !error && state?.hierarchyConfigured && (
          <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
            {renderSelection()}
            {renderSteps()}
          </Container>
        )}
      </Box>

      {/* Image zoom modal */}
      <Modal open={!!enlargedImage} onClose={() => setEnlargedImage(null)}>
        <Box
          onClick={() => setEnlargedImage(null)}
          sx={{
            position: "fixed",
            inset: 0,
            bgcolor: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            cursor: "zoom-out",
          }}
        >
          {enlargedImage && (
            <Box
              component="img"
              src={enlargedImage}
              alt="Enlarged step image"
              sx={{ maxWidth: "100%", maxHeight: "90vh", objectFit: "contain", borderRadius: 1 }}
            />
          )}
        </Box>
      </Modal>

      {/* Back to top */}
      {showBackToTop && (
        <Fab
          size="small"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            bgcolor: colors.primary,
            color: "#fff",
            "&:hover": { bgcolor: "#326b64" },
          }}
        >
          <KeyboardArrowUpIcon />
        </Fab>
      )}

      <Footer year={new Date().getFullYear()} isAdmin={false} />
    </Box>
  );
}
