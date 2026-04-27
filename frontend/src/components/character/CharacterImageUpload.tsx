import React, { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Edit, Trash2 } from "lucide-react";
import { characterApi, CharacterImage } from "../../api/character";

interface Props {
  episodeId: string;
  images: CharacterImage[];
  onImageUpdate?: () => void;
}

export function CharacterImageUpload({ episodeId, images, onImageUpdate }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [editingImage, setEditingImage] = useState<CharacterImage | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: ({ file, name, description }: { file: File; name: string; description: string }) =>
      characterApi.uploadCharacterImage(episodeId, file, { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characterImages', episodeId] });
      onImageUpdate?.();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ imageId, data }: { imageId: string; data: any }) =>
      characterApi.updateCharacterImage(imageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characterImages', episodeId] });
      setEditingImage(null);
      onImageUpdate?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => characterApi.deleteCharacterImage(imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characterImages', episodeId] });
      onImageUpdate?.();
    },
  });

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(f => f.type.startsWith('image/'));
    
    if (imageFile) {
      await handleFileUpload(imageFile);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (images.length >= 3) {
      alert("캐릭터 이미지는 최대 3개까지 업로드 가능합니다.");
      return;
    }

    const name = `캐릭터 ${images.length + 1}`;
    const description = "";
    
    uploadMutation.mutate({ file, name, description });
  };

  const handleEdit = (image: CharacterImage) => {
    setEditingImage(image);
    setEditName(image.name);
    setEditDescription(image.description || "");
  };

  const handleSaveEdit = () => {
    if (editingImage) {
      updateMutation.mutate({
        imageId: editingImage.id,
        data: { name: editName, description: editDescription }
      });
    }
  };

  const getImageUrl = (image: CharacterImage) => {
    const filename = image.imageUrl.split('/').pop();
    return characterApi.getImageUrl(episodeId, filename || '');
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-parchment font-body font-semibold">캐릭터 이미지</h3>
          <p className="text-parchment/50 text-xs font-body mt-0.5">일관된 캐릭터 생성을 위한 참조 이미지 (최대 3개)</p>
        </div>
        <span className="text-xs text-parchment/60">{images.length}/3</span>
      </div>

      {/* 업로드 영역 */}
      {images.length < 3 && (
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
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
          {uploadMutation.isPending && (
            <p className="text-gold text-sm font-body mt-2">업로드 중...</p>
          )}
        </div>
      )}

      {/* 업로드된 이미지 목록 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map((image) => (
          <div key={image.id} className="border border-gold/20 rounded-xl p-3 bg-ink-light">
            <div className="relative group">
              <img
                src={getImageUrl(image)}
                alt={image.name}
                className="w-full h-32 object-cover rounded-lg mb-2"
              />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(image)}
                    className="p-1 bg-black/50 text-white rounded hover:bg-black/70"
                  >
                    <Edit size={12} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(image.id)}
                    className="p-1 bg-red-500/50 text-white rounded hover:bg-red-500/70"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-parchment text-sm font-body font-semibold">{image.name}</p>
            {image.description && (
              <p className="text-parchment/50 text-xs font-body mt-1">{image.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* 편집 모달 */}
      {editingImage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-ink border border-gold/20 rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-parchment font-body font-semibold">캐릭터 이미지 편집</h4>
              <button
                onClick={() => setEditingImage(null)}
                className="text-parchment/50 hover:text-parchment"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-parchment/80 text-sm font-body mb-1">
                  캐릭터 이름
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-ink-light border border-white/20 rounded-lg text-parchment font-body text-sm focus:border-gold focus:outline-none"
                  placeholder="캐릭터 이름을 입력하세요"
                />
              </div>
              
              <div>
                <label className="block text-parchment/80 text-sm font-body mb-1">
                  설명 (선택사항)
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-ink-light border border-white/20 rounded-lg text-parchment font-body text-sm focus:border-gold focus:outline-none resize-none"
                  placeholder="캐릭터 설명을 입력하세요"
                  rows={3}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setEditingImage(null)}
                className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-parchment/80 text-sm font-body hover:bg-white/5"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2 bg-gold hover:bg-gold-light disabled:opacity-50 text-ink text-sm font-body font-semibold rounded-lg transition-colors"
              >
                {updateMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 오류 메시지 */}
      {uploadMutation.error && (
        <p className="text-red-400 text-sm font-body">
          업로드 오류: {(uploadMutation.error as any)?.response?.data?.error ?? uploadMutation.error.message}
        </p>
      )}
    </div>
  );
}