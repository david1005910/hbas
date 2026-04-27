import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Wand2, Download, Copy, RefreshCw, Upload, X } from "lucide-react";
import { thumbnailApi, type Thumbnail, type ThumbnailGenerateRequest } from "../../api/thumbnail";

interface Props {
  episodeId: string;
  onDone?: () => void;
}

interface ReferenceImage {
  file: File;
  preview: string;
  base64: string;
}

export function ThumbnailGenerator({ episodeId, onDone }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shortText, setShortText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<"cinematic" | "modern" | "classic">("cinematic");
  const [selectedColorScheme, setSelectedColorScheme] = useState<"vibrant" | "dark" | "light">("vibrant");
  const [selectedTextSize, setSelectedTextSize] = useState<"large" | "medium" | "small">("large");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4000";

  // 기존 썸네일 조회
  const { data: thumbnailsData, isLoading: loadingThumbnails } = useQuery({
    queryKey: ['thumbnails', episodeId],
    queryFn: () => thumbnailApi.getThumbnails(episodeId),
  });

  // 단일 썸네일 생성
  const singleMutation = useMutation({
    mutationFn: (data: ThumbnailGenerateRequest) => 
      thumbnailApi.generateSingle(episodeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thumbnails', episodeId] });
      onDone?.();
    },
  });

  // 다중 썸네일 생성
  const multipleMutation = useMutation({
    mutationFn: (data: { shortText: string }) => 
      thumbnailApi.generateMultiple(episodeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thumbnails', episodeId] });
      onDone?.();
    },
  });

  const handleGenerateSingle = () => {
    if (!shortText.trim()) return;
    
    const referenceImageBase64 = referenceImages.map(img => img.base64);
    
    singleMutation.mutate({
      shortText: shortText.trim(),
      style: selectedStyle,
      colorScheme: selectedColorScheme,
      textSize: selectedTextSize,
      referenceImages: referenceImageBase64.length > 0 ? referenceImageBase64 : undefined,
    });
  };

  const handleGenerateMultiple = () => {
    if (!shortText.trim()) return;
    
    const referenceImageBase64 = referenceImages.map(img => img.base64);
    
    multipleMutation.mutate({
      shortText: shortText.trim(),
      referenceImages: referenceImageBase64.length > 0 ? referenceImageBase64 : undefined,
    });
  };

  // 이미지 파일을 base64로 변환
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // data:image/png;base64, 부분 제거하고 base64만 추출
        resolve(base64.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  // 참조 이미지 추가
  const handleImageAdd = async (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (referenceImages.length + imageFiles.length > 3) {
      alert('참조 이미지는 최대 3개까지 업로드 가능합니다.');
      return;
    }

    const newImages: ReferenceImage[] = [];
    
    for (const file of imageFiles) {
      if (file.size > 10 * 1024 * 1024) { // 10MB 제한
        alert(`${file.name} 파일이 너무 큽니다. (최대 10MB)`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        const preview = URL.createObjectURL(file);
        
        newImages.push({
          file,
          preview,
          base64
        });
      } catch (error) {
        console.error('이미지 처리 오류:', error);
      }
    }

    setReferenceImages(prev => [...prev, ...newImages]);
  };

  // 파일 선택 핸들러
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleImageAdd(files);
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleImageAdd(files);
  };

  // 참조 이미지 제거
  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const isGenerating = singleMutation.isPending || multipleMutation.isPending;
  const error = singleMutation.error || multipleMutation.error;
  const thumbnails = thumbnailsData?.thumbnails || [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">유튜브 썸네일</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">
            16:9 고화질 썸네일 생성 (1280×720)
          </p>
        </div>
      </div>

      {/* 썸네일 텍스트 입력 */}
      <div className="space-y-3">
        <label className="block text-parchment/80 text-sm font-body">
          썸네일 메인 텍스트 *
        </label>
        <input
          type="text"
          value={shortText}
          onChange={(e) => setShortText(e.target.value)}
          placeholder="예: 에덴의 시작과 끝"
          className="w-full px-4 py-3 bg-ink-light border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body text-sm outline-none transition-colors"
          maxLength={50}
        />
        <p className="text-xs text-parchment/40 font-body text-right">
          {shortText.length}/50자 (모바일 최적화를 위해 짧게 작성)
        </p>
      </div>

      {/* 참조 이미지 업로드 */}
      <div className="space-y-3">
        <label className="block text-parchment/80 text-sm font-body">
          참조 이미지 (선택사항)
        </label>
        <p className="text-parchment/50 text-xs font-body">
          썸네일 생성 시 참고할 이미지를 업로드하세요 (최대 3개, 각 10MB 이하)
        </p>

        {/* 업로드 영역 */}
        {referenceImages.length < 3 && (
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-gold bg-gold/5"
                : "border-white/20 hover:border-gold/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-gold mx-auto mb-2" />
            <p className="text-parchment/80 text-sm font-body mb-1">
              이미지를 드래그하여 놓거나 클릭하여 선택
            </p>
            <p className="text-parchment/50 text-xs font-body">
              PNG, JPG, JPEG 파일 지원 (최대 10MB)
            </p>
          </div>
        )}

        {/* 업로드된 참조 이미지 목록 */}
        {referenceImages.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {referenceImages.map((refImage, index) => (
              <div key={index} className="relative group border border-gold/20 rounded-lg overflow-hidden">
                <img
                  src={refImage.preview}
                  alt={`참조 이미지 ${index + 1}`}
                  className="w-full h-24 object-cover"
                />
                <button
                  onClick={() => removeReferenceImage(index)}
                  className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="제거"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                  {refImage.file.name}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-parchment/50">
            {referenceImages.length}/3개 업로드됨
          </span>
          {referenceImages.length > 0 && (
            <button
              onClick={() => {
                referenceImages.forEach(img => URL.revokeObjectURL(img.preview));
                setReferenceImages([]);
              }}
              className="text-red-400/70 hover:text-red-400 font-body"
            >
              모두 제거
            </button>
          )}
        </div>
      </div>

      {/* 스타일 옵션 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 스타일 선택 */}
        <div className="space-y-2">
          <label className="block text-parchment/80 text-sm font-body">스타일</label>
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value as any)}
            className="w-full px-3 py-2 bg-ink-light border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body text-sm outline-none"
          >
            <option value="cinematic">시네마틱</option>
            <option value="modern">모던</option>
            <option value="classic">클래식</option>
          </select>
        </div>

        {/* 색상 스킴 */}
        <div className="space-y-2">
          <label className="block text-parchment/80 text-sm font-body">색상</label>
          <select
            value={selectedColorScheme}
            onChange={(e) => setSelectedColorScheme(e.target.value as any)}
            className="w-full px-3 py-2 bg-ink-light border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body text-sm outline-none"
          >
            <option value="vibrant">생생한</option>
            <option value="dark">다크</option>
            <option value="light">밝은</option>
          </select>
        </div>

        {/* 텍스트 크기 */}
        <div className="space-y-2">
          <label className="block text-parchment/80 text-sm font-body">텍스트 크기</label>
          <select
            value={selectedTextSize}
            onChange={(e) => setSelectedTextSize(e.target.value as any)}
            className="w-full px-3 py-2 bg-ink-light border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body text-sm outline-none"
          >
            <option value="large">크게</option>
            <option value="medium">보통</option>
            <option value="small">작게</option>
          </select>
        </div>
      </div>

      {/* 생성 버튼 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleGenerateSingle}
          disabled={isGenerating || !shortText.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <Wand2 size={14} />
          {isGenerating ? "생성 중..." : "단일 썸네일"}
        </button>
        
        <button
          onClick={handleGenerateMultiple}
          disabled={isGenerating || !shortText.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <RefreshCw size={14} />
          {isGenerating ? "생성 중..." : "3가지 변형"}
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <p className="text-red-400 text-sm font-body">
          {(error as any)?.response?.data?.error ?? (error as any)?.message ?? "썸네일 생성 실패"}
        </p>
      )}

      {/* 기존 썸네일 목록 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-parchment/80 text-sm font-body font-semibold">생성된 썸네일</h4>
          <span className="text-xs text-parchment/50">
            {thumbnails.length}개
          </span>
        </div>

        {loadingThumbnails ? (
          <div className="text-parchment/50 text-sm font-body">로딩 중...</div>
        ) : thumbnails.length === 0 ? (
          <div className="border border-gold/20 rounded-xl p-8 text-center bg-ink-light">
            <Image className="w-12 h-12 text-parchment/30 mx-auto mb-3" />
            <div className="text-parchment/50 text-sm font-body mb-2">아직 생성된 썸네일이 없습니다</div>
            <div className="text-parchment/30 text-xs font-body">
              위에서 텍스트를 입력하고 썸네일을 생성해보세요
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {thumbnails.map((thumbnail, index) => (
              <div
                key={thumbnail.id || index}
                className="border border-gold/20 rounded-xl overflow-hidden bg-ink-light group hover:border-gold/40 transition-colors"
              >
                <div className="aspect-video relative">
                  <img
                    src={`${apiBase}${thumbnail.webPath}`}
                    alt={`썸네일 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex gap-2">
                      <button
                        onClick={() => window.open(`${apiBase}${thumbnail.webPath}`, '_blank')}
                        className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
                        title="크게 보기"
                      >
                        <Image size={16} />
                      </button>
                      <a
                        href={`${apiBase}${thumbnail.webPath}`}
                        download={`thumbnail_${index + 1}.png`}
                        className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
                        title="다운로드"
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  </div>
                </div>
                
                <div className="p-3">
                  <div className="text-xs text-parchment/60 font-body">
                    {thumbnail.variant ? (
                      <span className="inline-block px-2 py-1 bg-gold/20 text-gold/80 rounded text-xs">
                        {thumbnail.variant}
                      </span>
                    ) : (
                      "커스텀"
                    )}
                  </div>
                  {thumbnail.createdAt && (
                    <div className="text-xs text-parchment/40 font-body mt-1">
                      {new Date(thumbnail.createdAt).toLocaleDateString('ko-KR')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}