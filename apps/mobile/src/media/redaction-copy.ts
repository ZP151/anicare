import type { Locale } from '../i18n/catalog';

export type RedactionReviewCopy = Readonly<{
  title: string;
  subtitle: string;
  peopleUnavailable: string;
  platesUnavailable: string;
  catsUnavailable: string;
  detectorWarning: string;
  reviewedImageLabel: string;
  choosePhoto: string;
  takePhoto: string;
  cameraDenied: string;
  preparing: string;
  clearMasks: string;
  working: string;
  retrySaving: string;
  confirmPixels: string;
  preparingPrivateCopy: string;
  adjustMasks: string;
  secureProcessingUnavailable: string;
  photoPreparationFailed: string;
  renderingMasks: string;
  masksCleared: string;
  maskApplied: string;
  maskRenderFailed: string;
  pixelsMustBeReviewed: string;
  encrypting: string;
  persistencePending: string;
  encryptedCopyUnauthenticated: string;
  savedPrivately: string;
  signInAgain: string;
  privateStorageFailed: string;
}>;

const en: RedactionReviewCopy = {
  title: 'Private photo review',
  subtitle: 'Only a newly rendered, confirmed copy can be encrypted for this draft.',
  peopleUnavailable: 'People detection: unavailable',
  platesUnavailable: 'Licence-plate detection: unavailable',
  catsUnavailable: 'Cat detection: unavailable',
  detectorWarning: 'No automatic detector has checked this image. You must inspect it manually.',
  reviewedImageLabel: 'Reviewed private image',
  choosePhoto: 'Choose photo for private review',
  takePhoto: 'Take photo for private review',
  cameraDenied: 'Camera permission was not granted. You can still choose a photo.',
  preparing: 'Preparing…',
  clearMasks: 'Clear all masks',
  working: 'Working…',
  retrySaving: 'Retry saving encrypted reference',
  confirmPixels: 'Confirm exact pixels and encrypt',
  preparingPrivateCopy: 'Preparing a private review copy…',
  adjustMasks: 'Add, select and adjust opaque masks, then review every pixel before confirming.',
  secureProcessingUnavailable: 'Secure media processing is unavailable on this device.',
  photoPreparationFailed: 'The photo could not be prepared safely. Nothing was staged.',
  renderingMasks: 'Rendering the updated opaque masks…',
  masksCleared: 'Masks cleared. Review the newly rendered pixels before confirming.',
  maskApplied: 'Mask applied to final pixels. Review again before confirming.',
  maskRenderFailed: 'The mask could not be rendered safely. Confirmation remains disabled.',
  pixelsMustBeReviewed: 'The exact rendered pixels must be reviewed again.',
  encrypting: 'Encrypting the reviewed copy on this device…',
  persistencePending: 'Private persistence is pending. Retry safely with the same immutable encrypted reference.',
  encryptedCopyUnauthenticated: 'The encrypted copy could not be authenticated. Select and review the photo again.',
  savedPrivately: 'Encrypted reviewed media saved privately. It has not been uploaded or published.',
  signInAgain: 'Sign in again before saving reviewed media. No media was staged.',
  privateStorageFailed: 'Private encrypted storage failed. The media was not staged.',
};

const zhCN: RedactionReviewCopy = {
  title: '私密照片复核',
  subtitle: '只有重新渲染并由你确认的副本，才能为此草稿加密保存。',
  peopleUnavailable: '人物检测：不可用',
  platesUnavailable: '车牌检测：不可用',
  catsUnavailable: '猫咪检测：不可用',
  detectorWarning: '没有自动检测器检查过这张图片，你必须手动检查。',
  reviewedImageLabel: '已复核的私密图片',
  choosePhoto: '选择照片进行私密复核',
  takePhoto: '拍摄照片进行私密复核',
  cameraDenied: '未获得相机权限，你仍可从照片库选择照片。',
  preparing: '正在准备…',
  clearMasks: '清除全部遮挡',
  working: '处理中…',
  retrySaving: '重试保存加密引用',
  confirmPixels: '确认精确像素并加密',
  preparingPrivateCopy: '正在准备私密复核副本…',
  adjustMasks: '添加、选择并调整不透明遮挡，然后在确认前检查每个像素。',
  secureProcessingUnavailable: '此设备无法使用安全媒体处理。',
  photoPreparationFailed: '无法安全处理这张照片，未暂存任何内容。',
  renderingMasks: '正在渲染更新后的不透明遮挡…',
  masksCleared: '遮挡已清除，请在确认前检查新渲染的像素。',
  maskApplied: '遮挡已应用到最终像素，请再次检查后再确认。',
  maskRenderFailed: '无法安全渲染遮挡，确认功能仍保持禁用。',
  pixelsMustBeReviewed: '必须再次检查实际渲染的像素。',
  encrypting: '正在此设备上加密已复核的副本…',
  persistencePending: '私密保存仍在处理中，请使用同一不可变加密引用安全重试。',
  encryptedCopyUnauthenticated: '无法验证加密副本，请重新选择并复核照片。',
  savedPrivately: '已私密保存加密后的复核媒体，尚未上传或公开。',
  signInAgain: '请重新登录后再保存复核媒体，未暂存任何媒体。',
  privateStorageFailed: '私密加密存储失败，未暂存该媒体。',
};

export function getRedactionReviewCopy(locale: Locale): RedactionReviewCopy {
  return locale === 'zh-CN' ? zhCN : en;
}
