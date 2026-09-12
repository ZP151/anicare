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
  libraryDenied: string;
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
  title: 'Add sighting photo',
  subtitle: 'Cover faces or plates before adding the photo to your draft.',
  peopleUnavailable: 'People detection: unavailable',
  platesUnavailable: 'Licence-plate detection: unavailable',
  catsUnavailable: 'Cat detection: unavailable',
  detectorWarning: 'Automatic detection is unavailable. Check faces and plates yourself.',
  reviewedImageLabel: 'Reviewed private image',
  choosePhoto: 'Photo library',
  takePhoto: 'Camera',
  cameraDenied: 'Camera permission was not granted. You can still choose a photo.',
  libraryDenied: 'Photo library permission was not granted. You can enable it in Settings and try again.',
  preparing: 'Preparing…',
  clearMasks: 'Clear all masks',
  working: 'Working…',
  retrySaving: 'Retry saving photo',
  confirmPixels: 'Use this photo',
  preparingPrivateCopy: 'Preparing a private review copy…',
  adjustMasks: 'Tap to add a mask. Drag it or its corners to adjust.',
  secureProcessingUnavailable: 'Secure media processing is unavailable on this device.',
  photoPreparationFailed: 'The photo could not be prepared safely. Nothing was staged.',
  renderingMasks: 'Rendering the updated opaque masks…',
  masksCleared: 'Masks cleared. Review the newly rendered pixels before confirming.',
  maskApplied: 'Mask applied to final pixels. Review again before confirming.',
  maskRenderFailed: 'The mask could not be rendered safely. Confirmation remains disabled.',
  pixelsMustBeReviewed: 'The exact rendered pixels must be reviewed again.',
  encrypting: 'Encrypting the reviewed copy on this device…',
  persistencePending: 'The photo has not finished saving. Tap Retry to continue.',
  encryptedCopyUnauthenticated: 'The encrypted copy could not be authenticated. Select and review the photo again.',
  savedPrivately: 'Encrypted reviewed media saved privately. It has not been uploaded or published.',
  signInAgain: 'Sign in again before saving reviewed media. No media was staged.',
  privateStorageFailed: 'Private encrypted storage failed. The media was not staged.',
};

const zhCN: RedactionReviewCopy = {
  title: '添加目击照片',
  subtitle: '添加到草稿前，可以遮住照片中的人脸、车牌等信息。',
  peopleUnavailable: '人物检测：不可用',
  platesUnavailable: '车牌检测：不可用',
  catsUnavailable: '猫咪检测：不可用',
  detectorWarning: '自动识别暂不可用，请自行检查人脸和车牌。',
  reviewedImageLabel: '已复核的私密图片',
  choosePhoto: '从相册选择',
  takePhoto: '拍照',
  cameraDenied: '未获得相机权限，你仍可从照片库选择照片。',
  libraryDenied: '未获得照片库权限。请在“设置”中开启后重试。',
  preparing: '正在准备…',
  clearMasks: '清除全部遮挡',
  working: '处理中…',
  retrySaving: '重试保存照片',
  confirmPixels: '使用这张照片',
  preparingPrivateCopy: '正在准备私密复核副本…',
  adjustMasks: '轻点添加遮挡，拖动遮挡或角点调整。',
  secureProcessingUnavailable: '此设备无法使用安全媒体处理。',
  photoPreparationFailed: '无法安全处理这张照片，未暂存任何内容。',
  renderingMasks: '正在渲染更新后的不透明遮挡…',
  masksCleared: '遮挡已清除，请在确认前检查新渲染的像素。',
  maskApplied: '遮挡已应用到最终像素，请再次检查后再确认。',
  maskRenderFailed: '无法安全渲染遮挡，确认功能仍保持禁用。',
  pixelsMustBeReviewed: '必须再次检查实际渲染的像素。',
  encrypting: '正在此设备上加密已复核的副本…',
  persistencePending: '照片尚未保存完成，点“重试”继续。',
  encryptedCopyUnauthenticated: '无法验证加密副本，请重新选择并复核照片。',
  savedPrivately: '已私密保存加密后的复核媒体，尚未上传或公开。',
  signInAgain: '请重新登录后再保存复核媒体，未暂存任何媒体。',
  privateStorageFailed: '私密加密存储失败，未暂存该媒体。',
};

export function getRedactionReviewCopy(locale: Locale): RedactionReviewCopy {
  return locale === 'zh-CN' ? zhCN : en;
}
