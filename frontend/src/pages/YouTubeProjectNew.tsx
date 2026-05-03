import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Youtube, MessageCircle, Search, FileText, Sparkles } from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";

interface ProjectForm {
  title: string;
  description: string;
  niche: string;
  targetAudience: string;
  contentType: "educational" | "entertainment" | "tutorial" | "review" | "vlog";
}

export function YouTubeProjectNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"info" | "chat">("info");
  const [form, setForm] = useState<ProjectForm>({
    title: "",
    description: "",
    niche: "",
    targetAudience: "",
    contentType: "educational"
  });

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // YouTube 프로젝트를 백엔드에 저장
      const response = await fetch("http://localhost:4000/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.title,
          description: form.description,
          type: "youtube",
          niche: form.niche,
          targetAudience: form.targetAudience,
          contentType: form.contentType
        })
      });
      
      if (!response.ok) {
        throw new Error("프로젝트 생성 실패");
      }
      
      const newProject = await response.json();
      console.log("YouTube 프로젝트 생성 완료:", newProject);
      
      // 채팅 단계로 이동
      setStep("chat");
    } catch (error) {
      console.error("프로젝트 생성 오류:", error);
      alert("프로젝트 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  if (step === "chat") {
    return <YouTubeProjectChat projectForm={form} onBack={() => setStep("info")} />;
  }

  return (
    <PageWrapper
      title="YouTube 프로젝트 생성"
      subtitle="AI 기반 롱폼 YouTube 콘텐츠 제작"
      action={
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-4 py-2 border border-gold/30 hover:border-gold/50 text-parchment text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <ArrowLeft size={14} />
          대시보드로
        </button>
      }
    >
      <div className="max-w-2xl mx-auto">
        <div className="border border-gold/20 rounded-xl p-8 bg-ink-light">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto bg-red-600 rounded-full flex items-center justify-center mb-4">
              <Youtube className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-body font-bold text-parchment mb-2">
              새 YouTube 프로젝트
            </h2>
            <p className="text-parchment/60 font-body">
              AI와 함께 매력적인 YouTube 롱폼 콘텐츠를 기획하고 제작해보세요
            </p>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-6">
            <div>
              <label className="block text-parchment font-body font-semibold mb-2">
                프로젝트 제목 *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="예: 인공지능의 미래와 우리의 삶"
                className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-parchment font-body font-semibold mb-2">
                프로젝트 설명
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="이 프로젝트에 대한 간단한 설명을 입력하세요..."
                rows={3}
                className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-parchment font-body font-semibold mb-2">
                콘텐츠 니치/분야 *
              </label>
              <input
                type="text"
                value={form.niche}
                onChange={(e) => setForm({ ...form, niche: e.target.value })}
                placeholder="예: 기술, 교육, 게임, 요리, 여행 등"
                className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-parchment font-body font-semibold mb-2">
                타겟 오디언스 *
              </label>
              <input
                type="text"
                value={form.targetAudience}
                onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                placeholder="예: 20-30대 IT 관심자, 초보 개발자, 학습자 등"
                className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-parchment font-body font-semibold mb-2">
                콘텐츠 유형 *
              </label>
              <select
                value={form.contentType}
                onChange={(e) => setForm({ ...form, contentType: e.target.value as ProjectForm["contentType"] })}
                className="w-full px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
              >
                <option value="educational">교육/강의</option>
                <option value="tutorial">튜토리얼/가이드</option>
                <option value="review">리뷰/분석</option>
                <option value="entertainment">엔터테인먼트</option>
                <option value="vlog">브이로그/일상</option>
              </select>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-body font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} />
                AI와 콘텐츠 기획 시작하기
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
}

// YouTube 프로젝트 채팅 인터페이스
interface YouTubeProjectChatProps {
  projectForm: ProjectForm;
  onBack: () => void;
}

function YouTubeProjectChat({ projectForm, onBack }: YouTubeProjectChatProps) {
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string; timestamp: Date }>>([
    {
      id: "1",
      role: "assistant",
      content: `안녕하세요! "${projectForm.title}" 프로젝트를 함께 기획해보겠습니다.

**프로젝트 정보:**
• 분야: ${projectForm.niche}
• 타겟: ${projectForm.targetAudience}
• 유형: ${getContentTypeLabel(projectForm.contentType)}

어떤 주제로 YouTube 영상을 만들고 싶으신가요? 구체적인 주제나 키워드를 알려주시면, 제가 다음과 같은 도움을 드릴 수 있습니다:

🔍 **주제 리서치** - 트렌드 분석 및 키워드 조사
📝 **스크립트 작성** - 매력적인 롱폼 영상 대본 작성  
🎨 **썸네일 아이디어** - 클릭률 높은 썸네일 컨셉
📊 **SEO 최적화** - 제목, 설명, 태그 제안

어떤 주제에 대해 이야기해볼까요?`,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // AI 응답을 위한 빈 메시지 생성
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage = {
      id: assistantMessageId,
      role: "assistant" as const,
      content: "",
      timestamp: new Date()
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      // SSE를 사용하여 스트리밍 응답 받기
      let endpoint = "";
      let requestBody = {};
      
      if (userMessage.content.includes("스크립트") || userMessage.content.includes("대본")) {
        endpoint = "/api/v1/youtube/projects/script/stream";
        requestBody = {
          projectContext: {
            title: projectForm.title,
            description: projectForm.description,
            niche: projectForm.niche,
            targetAudience: projectForm.targetAudience,
            contentType: projectForm.contentType
          },
          topic: userMessage.content,
          duration: 15
        };
      } else if (userMessage.content.includes("트렌드") || userMessage.content.includes("분석")) {
        endpoint = "/api/v1/youtube/projects/trends/stream";
        requestBody = {
          projectContext: {
            title: projectForm.title,
            description: projectForm.description,
            niche: projectForm.niche,
            targetAudience: projectForm.targetAudience,
            contentType: projectForm.contentType
          },
          topic: userMessage.content
        };
      } else {
        // 기본적으로 콘텐츠 아이디어 생성
        endpoint = "/api/v1/youtube/projects/content-ideas/stream";
        requestBody = {
          projectContext: {
            title: projectForm.title,
            description: projectForm.description,
            niche: projectForm.niche,
            targetAudience: projectForm.targetAudience,
            contentType: projectForm.contentType
          },
          topic: userMessage.content
        };
      }

      const response = await fetch("http://localhost:4000" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API 요청 실패: ${response.statusText}`);
      }

      // SSE 스트림 읽기
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      if (!reader) {
        throw new Error("스트림을 읽을 수 없습니다");
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            
            if (data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.chunk) {
                accumulatedContent += parsed.chunk;
                
                // 메시지 업데이트
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedContent }
                    : msg
                ));
              }
              
              if (parsed.done) {
                setIsLoading(false);
              }
            } catch (e) {
              console.error("JSON 파싱 오류:", e);
            }
          }
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error("AI 분석 오류:", error);
      
      // 에러 발생 시 에러 메시지로 업데이트
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
              ...msg,
              content: `죄송합니다. AI 분석 중 오류가 발생했습니다.

**오류**: ${error instanceof Error ? error.message : "알 수 없는 오류"}

다시 시도하시거나 다음과 같이 입력해보세요:
• 📝 **스크립트 작성**: "스크립트 작성해줘"
• 🔍 **트렌드 분석**: "트렌드 분석해줘"  
• 💡 **아이디어 생성**: 주제를 구체적으로 입력`
            }
          : msg
      ));
      
      setIsLoading(false);
    }
  };

  return (
    <PageWrapper
      title={`${projectForm.title} - AI 콘텐츠 기획`}
      subtitle="Gemini AI와 함께 YouTube 롱폼 콘텐츠 제작"
      action={
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 border border-gold/30 hover:border-gold/50 text-parchment text-sm font-body font-semibold rounded-lg transition-colors"
        >
          <ArrowLeft size={14} />
          프로젝트 설정으로
        </button>
      }
    >
      <div className="max-w-4xl mx-auto h-[80vh] flex flex-col border border-gold/20 rounded-xl bg-ink-light">
        {/* 채팅 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "justify-end" : ""}`}>
              {message.role === "assistant" && (
                <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={16} className="text-red-500" />
                </div>
              )}
              
              <div className={`max-w-[70%] rounded-xl p-4 ${
                message.role === "user" 
                  ? "bg-blue-600/20 text-blue-100" 
                  : "bg-ink-dark text-parchment"
              }`}>
                <div className="whitespace-pre-wrap font-body text-sm">
                  {message.content}
                </div>
              </div>

              {message.role === "user" && (
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={16} className="text-blue-400" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center">
                <Sparkles size={16} className="text-red-500" />
              </div>
              <div className="bg-ink-dark rounded-xl p-4">
                <div className="flex items-center gap-2 text-parchment/60">
                  <div className="animate-spin w-4 h-4 border-2 border-parchment/20 border-t-parchment/60 rounded-full"></div>
                  <span className="text-sm font-body">AI가 분석 중...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 입력 영역 */}
        <div className="p-6 border-t border-gold/20">
          <div className="flex gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="YouTube 영상 주제나 아이디어를 입력하세요..."
              className="flex-1 px-4 py-3 bg-ink-dark border border-gold/30 focus:border-gold/60 rounded-lg text-parchment font-body outline-none"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-body font-semibold rounded-lg transition-colors"
            >
              전송
            </button>
          </div>
          
          {/* 빠른 액션 버튼들 */}
          <div className="flex gap-2 mt-4">
            <button 
              onClick={() => setInputValue(`${projectForm.niche} 트렌드 분석해줘`)}
              className="px-3 py-1 text-xs bg-gold/20 hover:bg-gold/30 text-gold rounded-md font-body transition-colors"
            >
              <Search size={12} className="inline mr-1" />
              트렌드 분석
            </button>
            <button 
              onClick={() => setInputValue(`${projectForm.niche}에 대한 YouTube 롱폼 스크립트 작성해줘`)}
              className="px-3 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-md font-body transition-colors"
            >
              <FileText size={12} className="inline mr-1" />
              스크립트 작성
            </button>
            <button 
              onClick={() => setInputValue(`${projectForm.targetAudience}를 위한 ${projectForm.niche} 콘텐츠 아이디어 제안해줘`)}
              className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md font-body transition-colors"
            >
              <Sparkles size={12} className="inline mr-1" />
              아이디어 생성
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

function getContentTypeLabel(type: ProjectForm["contentType"]): string {
  switch (type) {
    case "educational": return "교육/강의";
    case "tutorial": return "튜토리얼/가이드";
    case "review": return "리뷰/분석";
    case "entertainment": return "엔터테인먼트";
    case "vlog": return "브이로그/일상";
    default: return type;
  }
}