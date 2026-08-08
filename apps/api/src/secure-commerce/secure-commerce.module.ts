import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  CanonicalProviderWebhookController,
  ContractSignatureController,
  DocumentController,
  DocumentFolderController,
  OnlinePaymentController,
  PaymentReconciliationController,
  ProviderWebhookController,
  PublicPortfolioAssetController,
  SignatureController,
  SignatureSignerController,
  UploadController,
  InvitationMediaController,
  GuestInvitationMediaController,
  VendorContractDocumentController,
  VendorPortfolioAssetController,
  VendorSignatureController,
  WorkspaceContractDocumentController,
} from "./secure-commerce.controller";
import { secureCommerceProviderBindings } from "./providers";
import { SecureCommerceService } from "./secure-commerce.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [
    UploadController,
    InvitationMediaController,
    GuestInvitationMediaController,
    VendorPortfolioAssetController,
    PublicPortfolioAssetController,
    DocumentController,
    DocumentFolderController,
    WorkspaceContractDocumentController,
    VendorContractDocumentController,
    OnlinePaymentController,
    ContractSignatureController,
    SignatureController,
    SignatureSignerController,
    VendorSignatureController,
    ProviderWebhookController,
    CanonicalProviderWebhookController,
    PaymentReconciliationController,
  ],
  providers: [SecureCommerceService, ...secureCommerceProviderBindings],
  exports: [SecureCommerceService],
})
export class SecureCommerceModule {}
