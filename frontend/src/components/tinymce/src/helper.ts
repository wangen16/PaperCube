import { ossInfo } from '#/api/system/oss';

function isBufferLikeObject(
  value: unknown,
): value is { data?: number[]; type?: string } {
  return !!value && typeof value === 'object';
}

export function normalizeRichTextContent(content: unknown) {
  if (content == null || content === '') {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (content instanceof Uint8Array) {
    return new TextDecoder().decode(content);
  }

  if (isBufferLikeObject(content)) {
    if (
      content.type === 'Buffer' &&
      Array.isArray(content.data) &&
      content.data.every((item) => typeof item === 'number')
    ) {
      return new TextDecoder().decode(new Uint8Array(content.data));
    }

    if (
      Array.isArray(content.data) &&
      content.data.every((item) => typeof item === 'number')
    ) {
      return new TextDecoder().decode(new Uint8Array(content.data));
    }
  }

  return '';
}

/**
 * 富文本内容中图片ossId转换  确保每次链接都是最新获取的(对于私有桶情况)
 *
 * 当然你可以使用后端来解析dom替换 达到相同的效果 就不用前端调用了
 * 使用方法: 在赋值前调用此方法 contentWithOssIdTransform(content); 转换一次再赋值
 * @param content 富文本内容
 * @returns string
 */
export async function contentWithOssIdTransform(content: unknown) {
  const normalizedContent = normalizeRichTextContent(content);
  if (!normalizedContent) {
    return '';
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizedContent, 'text/html');
  const imgDom = doc.querySelectorAll('img[data-oss-id]');

  // 没有包含图片 不做处理
  if (imgDom.length === 0) {
    return normalizedContent;
  }

  // 提取所有data-oss-id属性 作为string[]
  const ossIds = [...imgDom].map(
    (img) => (img as HTMLImageElement).dataset.ossId ?? '',
  );
  // 兼容之前的代码 可能并没有储存ossId
  if (ossIds.length === 0) {
    return normalizedContent;
  }
  const ossFileList = await ossInfo(ossIds);

  imgDom.forEach((item) => {
    const img = item as HTMLImageElement;
    // 找到对应的 替换
    const src =
      ossFileList.find((file) => file.ossId === img.dataset.ossId)?.url ??
      // 未找到 取原先自己的src
      img.src;
    img.setAttribute('src', src);
  });

  // 获取dom string
  return doc.body.innerHTML;
}
