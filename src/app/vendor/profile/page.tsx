"use client";

import * as React from "react";
import { ImageIcon, Store, Upload } from "lucide-react";
import { VendorPage } from "@/components/vendor/vendor-page";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useVendorOrganization } from "@/lib/api/vendor-organization";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

export default function VendorProfileEditorPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const { toast } = useToast();
  const [profile, setProfile] = React.useState<OperationResource | null>(null);
  const [assets, setAssets] = React.useState<OperationResource[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [form, setForm] = React.useState<Record<string, string>>({
    category: "OTHER",
    pricingVisibility: "REQUEST_QUOTE",
    currency: "RON",
    languages: "ro",
  });
  React.useEffect(() => {
    if (!organizationId || loading || !organization) return;
    if (!can("vendor.profile.read")) return;
    void weddingOsApi
      .vendorProfile(organizationId)
      .then((value) => {
        setProfile(value);
        if (value)
          setForm({
            slug: String(value.slug),
            headline: String(value.headline),
            description: String(value.description),
            shortDescription: String(value.shortDescription),
            category: Array.isArray(value.categories)
              ? String(value.categories[0])
              : "OTHER",
            languages: Array.isArray(value.languages)
              ? value.languages.map(String).join(",")
              : "ro",
            pricingVisibility: String(value.pricingVisibility),
            startingPrice: value.startingPriceMinor
              ? String(Number(value.startingPriceMinor) / 100)
              : "",
            currency: String(value.currency ?? "RON"),
            responseTimeLabel: String(value.responseTimeLabel ?? ""),
            publicEmail: String(value.publicEmail ?? ""),
            publicPhone: String(value.publicPhone ?? ""),
          });
      })
      .catch((error) =>
        toast({
          title: "Profilul nu a putut fi încărcat",
          description: apiErrorMessage(error),
          variant: "error",
        }),
      );
  }, [organizationId, organization, loading, can, toast]);
  const loadAssets = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    if (!can("document.read")) {
      setAssets([]);
      return;
    }
    try {
      setAssets(
        (await weddingOsApi.vendorPortfolioAssets(organizationId)).items,
      );
    } catch (error) {
      toast({
        title: "Portofoliul nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, toast]);
  useDeferredLoad(loadAssets);
  const save = async () => {
    if (!context.organizationId) return;
    try {
      const next = await weddingOsApi.upsertVendorProfile(
        context.organizationId,
        profile?.version ?? null,
        {
          slug: form.slug,
          headline: form.headline,
          description: form.description,
          shortDescription: form.shortDescription,
          categories: [form.category],
          languages: form.languages
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          pricingVisibility: form.pricingVisibility,
          startingPriceMinor: form.startingPrice
            ? Math.round(Number(form.startingPrice) * 100)
            : null,
          currency: form.currency,
          responseTimeLabel: form.responseTimeLabel || null,
          publicEmail: form.publicEmail || null,
          publicPhone: form.publicPhone || null,
        },
      );
      setProfile(next);
      toast({ title: "Profil salvat ca draft", variant: "success" });
    } catch (error) {
      toast({
        title: "Profilul nu a fost salvat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const publish = async (active: boolean) => {
    if (!context.organizationId || !profile) return;
    try {
      const next = await weddingOsApi.publishVendorProfile(
        context.organizationId,
        profile.version,
        active,
      );
      setProfile(next);
      toast({
        title: active ? "Profil publicat" : "Profil retras",
        description: active
          ? "Marketplace-ul poate afișa acum profilul. Statutul de verificare rămâne separat."
          : undefined,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: active
          ? "Profilul nu poate fi publicat"
          : "Profilul nu a fost retras",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const uploadPortfolio = async (file: File) => {
    if (!context.organizationId) return;
    setUploading(true);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Sunt acceptate numai imagini JPEG, PNG sau WebP.");
      const bytes = await file.arrayBuffer();
      const checksum = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const session = await weddingOsApi.createVendorUploadSession(
        context.organizationId,
        {
          purpose: "VENDOR_PORTFOLIO_IMAGE",
          originalFileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          checksumSha256: checksum,
        },
      );
      await weddingOsApi.putSignedUpload(
        session.upload.url,
        file,
        session.upload.headers,
      );
      await weddingOsApi.completeUploadSession(session.id, checksum);
      toast({
        title: "Imagine trimisă la verificare",
        description:
          "Portofoliul va folosi numai derivatul WebP generat după scanarea antivirus.",
        variant: "success",
      });
      window.setTimeout(() => void loadAssets(), 1500);
      window.setTimeout(() => void loadAssets(), 4000);
    } catch (error) {
      toast({
        title: "Imaginea nu a fost încărcată",
        description:
          error instanceof Error ? error.message : apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const toggleAsset = async (asset: OperationResource) => {
    if (!context.organizationId) return;
    try {
      await weddingOsApi.updateVendorPortfolioAsset(
        context.organizationId,
        asset.id,
        Number(asset.version),
        { published: !asset.published },
      );
      await loadAssets();
      toast({
        title: asset.published ? "Imagine retrasă" : "Imagine publicată",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Portofoliul nu a fost actualizat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <VendorPage
      title="Profil furnizor"
      description="Profil public versionat; publicarea nu acordă automat statut verificat."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      {!organizationId ? (
        <EmptyState
          icon={Store}
          title="Nicio organizație"
          description="Creează organizația din dashboard-ul Vendor OS."
        />
      ) : organization && !can("vendor.profile.read") ? (
        <EmptyState
          icon={Store}
          title="Acces limitat"
          description="Rolul tău nu include consultarea profilului public al acestei organizații."
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">Stare profil</p>
                  <p className="text-xs text-muted">
                    {profile ? `versiunea ${profile.version}` : "profil nou"}
                  </p>
                </div>
                <Badge
                  variant={
                    profile?.publicationStatus === "PUBLISHED"
                      ? "success"
                      : "neutral"
                  }
                >
                  {profile
                    ? String(profile.publicationStatus).toLowerCase()
                    : "neconfigurat"}
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <fieldset disabled={!context.can("vendor.profile.write")}>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                {!context.can("vendor.profile.write") ? (
                  <p className="sm:col-span-2 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
                    Ai acces de consultare. Editarea profilului nu este inclusă
                    în rolul tău.
                  </p>
                ) : null}
                <Field label="Slug">
                  <Input
                    value={form.slug ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, slug: event.target.value })
                    }
                  />
                </Field>
                <Field label="Titlu public">
                  <Input
                    value={form.headline ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, headline: event.target.value })
                    }
                  />
                </Field>
                <Field label="Descriere scurtă" className="sm:col-span-2">
                  <Input
                    value={form.shortDescription ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, shortDescription: event.target.value })
                    }
                  />
                </Field>
                <Field label="Descriere" className="sm:col-span-2">
                  <Textarea
                    rows={7}
                    value={form.description ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </Field>
                <Field label="Categorie">
                  <Select
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                  >
                    {[
                      "VENUE",
                      "PHOTOGRAPHY",
                      "VIDEOGRAPHY",
                      "CATERING",
                      "MUSIC",
                      "DECOR",
                      "FLOWERS",
                      "TRANSPORT",
                      "ACCOMMODATION",
                      "CAKE",
                      "OTHER",
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Limbi (separate prin virgulă)">
                  <Input
                    value={form.languages}
                    onChange={(event) =>
                      setForm({ ...form, languages: event.target.value })
                    }
                  />
                </Field>
                <Field label="Vizibilitate preț">
                  <Select
                    value={form.pricingVisibility}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        pricingVisibility: event.target.value,
                      })
                    }
                  >
                    {["STARTING_FROM", "RANGE", "REQUEST_QUOTE", "HIDDEN"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field label="Preț de pornire (RON)">
                  <Input
                    inputMode="decimal"
                    value={form.startingPrice ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, startingPrice: event.target.value })
                    }
                  />
                </Field>
                <Field label="Timp de răspuns public">
                  <Input
                    value={form.responseTimeLabel ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        responseTimeLabel: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Email public">
                  <Input
                    type="email"
                    value={form.publicEmail ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, publicEmail: event.target.value })
                    }
                  />
                </Field>
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  {context.can("vendor.profile.write") ? (
                    <Button onClick={() => void save()}>Salvează</Button>
                  ) : null}
                  {context.can("vendor.profile.publish") &&
                  profile?.publicationStatus === "PUBLISHED" ? (
                    <Button
                      variant="outline"
                      onClick={() => void publish(false)}
                    >
                      Retrage profilul
                    </Button>
                  ) : context.can("vendor.profile.publish") ? (
                    <Button
                      variant="outline"
                      disabled={!profile}
                      onClick={() => void publish(true)}
                    >
                      Publică
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </fieldset>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">Portofoliu securizat</p>
                  <p className="text-xs text-muted">
                    Originalele rămân private; marketplace-ul primește numai
                    derivate WebP curate.
                  </p>
                </div>
                {context.can("document.upload") ? (
                  <Button
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="size-4" />
                    {uploading ? "Se verifică…" : "Încarcă imagine"}
                  </Button>
                ) : null}
                {context.can("document.upload") ? (
                  <input
                    ref={fileInput}
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadPortfolio(file);
                    }}
                  />
                ) : null}
              </div>
              {assets.length === 0 ? (
                <EmptyState
                  icon={ImageIcon}
                  title="Nicio imagine în portofoliu"
                  description="Încarcă o imagine; publicarea devine disponibilă după scanare și generarea derivatului."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="overflow-hidden rounded-xl border border-border bg-subtle"
                    >
                      <div className="flex aspect-video items-center justify-center bg-surface">
                        {asset.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- this authenticated preview uses the secured same-origin derivative endpoint.
                          <img
                            src={String(asset.url)}
                            alt={String(asset.altText)}
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="size-8 text-faint" />
                        )}
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink">
                            {String(asset.title)}
                          </p>
                          <Badge
                            variant={
                              asset.published
                                ? "success"
                                : asset.sourceStatus === "AVAILABLE"
                                  ? "neutral"
                                  : "warning"
                            }
                          >
                            {asset.published
                              ? "public"
                              : asset.sourceStatus === "AVAILABLE"
                                ? "pregătit"
                                : "procesare"}
                          </Badge>
                        </div>
                        {context.can("document.write") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={asset.sourceStatus !== "AVAILABLE"}
                            onClick={() => void toggleAsset(asset)}
                          >
                            {asset.published ? "Retrage" : "Publică"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </VendorPage>
  );
}
