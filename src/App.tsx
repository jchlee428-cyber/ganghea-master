/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BookOpen, Send, AlertTriangle, CheckCircle, BrainCircuit, Activity, ChevronRight, RefreshCw, History as HistoryIcon, X, Trash2, MessageSquareQuote, Share2, Copy, Info, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2pdf from 'html2pdf.js';
import Markdown from 'react-markdown';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

interface AnalysisResult {
  summary: string;
  strengths: string[];
  concerns: string[];
  evaluation: string;
  macArthurIndex: number;
}

interface HistoryItem {
  id: string;
  createdAt: string;
  title: string;
  sermonText: string;
  result: AnalysisResult;
}

export default function App() {
  const [sermonTitle, setSermonTitle] = useState('');
  const [sermonText, setSermonText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [reconstructedSermon, setReconstructedSermon] = useState<string | null>(null);
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history');
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('정말로 이 기록을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/history/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
      } else {
        alert('삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error("Failed to delete history", err);
      alert('오류가 발생했습니다.');
    }
  };

  const handleAnalyze = async () => {
    if (!sermonText.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    setReconstructedSermon(null);

    
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: sermonTitle, text: sermonText }),
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          throw new Error(errData.error || '설교 분석 중 오류가 발생했습니다.');
        } else {
          const text = await response.text();
          console.error("Non-JSON error response:", text);
          if (response.status === 504 || response.status === 500) {
            throw new Error(`서버 타임아웃(${response.status}): 텍스트가 너무 길어 Vercel 무료 티어의 처리 시간(10초)을 초과했거나 과부하가 발생했습니다.`);
          }
          throw new Error(`서버 오류가 발생했습니다 (${response.status}). 일시적인 장애일 수 있습니다.`);
        }
      }
      
      const data = await response.json();
      setResult(data.result);
      setHistory(prev => [data, ...prev]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReconstruct = async () => {
    if (!result) return;
    
    setIsReconstructing(true);
    try {
      const response = await fetch('/api/reconstruct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: sermonTitle, 
          text: sermonText,
          summary: result.summary 
        }),
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          throw new Error(errData.error || '설교문 재구성에 실패했습니다.');
        } else {
          if (response.status === 504 || response.status === 500) {
            throw new Error('서버 타임아웃: 구글 AI 응답이나 서버 처리 시간이 지연되고 있습니다.');
          }
          throw new Error('서버 오류로 인해 설교문 재구성에 실패했습니다.');
        }
      }
      
      const data = await response.json();
      setReconstructedSermon(data.sermon);
    } catch (err: any) {
      console.error(err);
      alert(err.message || '설교문 재구성에 실패했습니다.');
    } finally {
      setIsReconstructing(false);
    }
  };

  const handleExpandSermon = async () => {
    if (!reconstructedSermon) return;
    
    setIsExpanding(true);
    try {
      const response = await fetch('/api/expand-reconstruct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: sermonTitle, 
          reconstructedSermon 
        }),
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          throw new Error(errData.error || '설교문 확장에 실패했습니다.');
        } else {
          if (response.status === 504 || response.status === 500) {
            throw new Error('서버 타임아웃: 기능 확장에 필요한 서버 응답 시간이 초과되었습니다.');
          }
          throw new Error('서버 오류로 인해 설교문 확장에 실패했습니다.');
        }
      }
      
      const data = await response.json();
      setReconstructedSermon(data.sermon);
    } catch (err: any) {
      console.error(err);
      alert(err.message || '설교문 확장에 실패했습니다.');
    } finally {
      setIsExpanding(false);
    }
  };

  const handleShare = async () => {
    if (!result) return;

    const shareTitle = `강해설교 분석 결과: ${sermonTitle || '무제'}`;
    const shareText = `맥아더 지수: ${result.macArthurIndex}%\n\n설교 요약:\n${result.summary}\n\n[총평]\n${result.evaluation.substring(0, 150)}...`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareTitle}\n\n${shareText}`);
        alert('분석 결과가 클립보드에 복사되었습니다.');
      } catch (err) {
        console.error('Copy failed:', err);
        alert('클립보드 복사에 실패했습니다.');
      }
    }
  };

  const handleDownloadPDF = () => {
    if (!result) return;

    const getScoreHexColor = (score: number) => {
      if (score >= 85) return '#059669'; // emerald-600
      if (score >= 60) return '#d97706'; // amber-600
      return '#dc2626'; // red-600
    };

    const htmlContent = `
      <div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; padding: 30px; color: #1c1917; line-height: 1.6; background-color: #ffffff;">
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #e7e5e4; padding-bottom: 12px; color: #1c1917;">
          강해설교 분석 결과: ${sermonTitle || '무제'}
        </h1>
        <h2 style="font-size: 20px; color: ${getScoreHexColor(result.macArthurIndex)}; margin-top: 15px; font-weight: bold;">
          📊 맥아더 지수: ${result.macArthurIndex}%
        </h2>
        
        <div style="margin-top: 25px;">
          <h3 style="font-size: 17px; font-weight: bold; background-color: #f5f5f4; padding: 10px 12px; border-radius: 6px; color: #292524;">📝 설교 요약</h3>
          <p style="margin-top: 12px; font-size: 14px; white-space: pre-wrap; padding: 0 5px;">${result.summary}</p>
        </div>

        <div style="margin-top: 25px;">
          <h3 style="font-size: 17px; font-weight: bold; background-color: #ecfdf5; padding: 10px 12px; border-radius: 6px; color: #065f46;">✅ 강점 (존 맥아더적 관점)</h3>
          <ul style="margin-top: 12px; padding-left: 25px; font-size: 14px; margin-bottom: 0;">
            ${result.strengths.map(s => `<li style="margin-bottom: 6px;">${s}</li>`).join('')}
          </ul>
        </div>

        <div style="margin-top: 25px;">
          <h3 style="font-size: 17px; font-weight: bold; background-color: #fef2f2; padding: 10px 12px; border-radius: 6px; color: #991b1b;">⚠️ 우려 및 비판</h3>
          <ul style="margin-top: 12px; padding-left: 25px; font-size: 14px; margin-bottom: 0;">
            ${result.concerns.map(c => `<li style="margin-bottom: 6px;">${c}</li>`).join('')}
          </ul>
        </div>

        <div style="margin-top: 25px;">
          <h3 style="font-size: 17px; font-weight: bold; background-color: #fffbeb; padding: 10px 12px; border-radius: 6px; color: #92400e;">💡 총평 및 개선 제언</h3>
          <p style="margin-top: 12px; font-size: 14px; white-space: pre-wrap; padding: 0 5px;">${result.evaluation}</p>
        </div>
        
        ${reconstructedSermon ? `
        <div style="margin-top: 35px; border-top: 2px dashed #d6d3d1; padding-top: 25px;">
          <h3 style="font-size: 17px; font-weight: bold; background-color: #1c1917; color: #facc15; padding: 10px 12px; border-radius: 6px;">📖 존 맥아더 스타일 재구성 설교문</h3>
          <div style="margin-top: 15px; font-size: 14px; white-space: pre-wrap; line-height: 1.7; padding: 0 5px;">${reconstructedSermon.replace(/### |## |# |\*\*/g, '')}</div>
        </div>
        ` : ''}
      </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    
    document.body.appendChild(element);

    const opt = {
      margin:       10,
      filename:     `${sermonTitle || '설교분석'}_결과.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      document.body.removeChild(element);
    });
  };

  const handleDownloadDocx = async () => {
    if (!reconstructedSermon) return;

    const children: Paragraph[] = [];
    const lines = reconstructedSermon.split('\n');

    // Title
    children.push(
      new Paragraph({
        text: `재구성된 강해설교문: ${sermonTitle || '무제'}`,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        continue;
      }

      if (line.startsWith('# ')) {
        children.push(
          new Paragraph({
            text: line.replace('# ', '').replace(/\*\*(.*?)\*\*/g, "$1"),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        );
      } else if (line.startsWith('## ')) {
        children.push(
          new Paragraph({
            text: line.replace('## ', '').replace(/\*\*(.*?)\*\*/g, "$1"),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          })
        );
      } else if (line.startsWith('### ')) {
        children.push(
          new Paragraph({
            text: line.replace('### ', '').replace(/\*\*(.*?)\*\*/g, "$1"),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          })
        );
      } else {
        // Handle bold basic parsing
        const parts = line.split(/(\*\*.*?\*\*)/g);
        const runs = parts.map(part => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return new TextRun({ text: part.slice(2, -2), bold: true });
          }
          return new TextRun({ text: part });
        }).filter(run => run.text !== "");

        children.push(
          new Paragraph({
            children: runs,
            spacing: { after: 200 },
          })
        );
      }
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }]
    });

    try {
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${sermonTitle || '강해설교문'}_재구성.docx`);
    } catch (err) {
      console.error(err);
      alert('DOCX 다운로드에 실패했습니다.');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-rose-600';
  };

  return (
    <div className="min-h-screen font-sans text-stone-800 bg-[#FAFAFA] flex flex-col">
      {/* Header */}
      <header className="bg-stone-900 text-stone-50 py-8 px-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
          <BookOpen size={240} />
        </div>
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="flex items-center gap-2 px-3 py-1.5 bg-stone-800/80 hover:bg-stone-700 text-stone-300 rounded-full text-sm font-medium transition-all mr-2"
            >
              <HistoryIcon size={16} /> 이전 기록
            </button>
            <BookOpen className="text-amber-400" size={28} />
            <span className="font-semibold text-stone-300 tracking-wider text-sm">신학적 분석</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold font-serif mb-3 tracking-tight">강해설교 마스터 클래스</h1>
          <p className="text-stone-400 max-w-2xl text-lg">
            존 맥아더(John MacArthur) 목사의 강해설교 원칙을 기준으로 설교를 비판적으로 분석합니다. 오직 성경, 절대적 권위를 향한 검증 파트너.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 my-8 pb-20">
        
        {/* Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-stone-900/40 z-40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between p-6 border-b border-stone-100">
            <h2 className="text-xl font-bold font-serif flex items-center gap-2">
              <HistoryIcon size={20} className="text-stone-600" />
              분석 히스토리
            </h2>
            <button onClick={() => setIsSidebarOpen(false)} className="text-stone-400 hover:text-stone-700 transition">
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 ? (
              <div className="text-center text-stone-400 py-10 mt-10">
                <p>저장된 기록이 없습니다.</p>
              </div>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSermonTitle(item.title && item.title !== (item.result.summary.substring(0, 50) + "...") ? item.title : '');
                    setSermonText(item.sermonText);
                    setResult(item.result);
                    setReconstructedSermon(null);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full text-left p-4 rounded-xl border border-stone-100 bg-stone-50 hover:bg-stone-100 hover:border-stone-200 transition-all flex flex-col gap-2"
                >
                  <div className="flex justify-between items-start w-full">
                    <span className="text-xs text-stone-400 font-medium whitespace-nowrap">{new Date(item.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                       <span className={`text-xs whitespace-nowrap font-bold px-2 py-0.5 rounded-full ${item.result.macArthurIndex >= 85 ? 'bg-emerald-100 text-emerald-700' : item.result.macArthurIndex >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                         {item.result.macArthurIndex}%
                       </span>
                       <button
                         onClick={(e) => handleDeleteHistory(item.id, e)}
                         className="text-stone-300 hover:text-rose-500 transition-colors p-1"
                         title="삭제"
                       >
                         <Trash2 size={14} />
                       </button>
                    </div>
                  </div>
                  <h3 className="font-medium text-stone-800 text-sm line-clamp-2 leading-relaxed">{item.title}</h3>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Input Column */}
        <section className={`transition-all duration-500 ease-in-out flex flex-col ${result ? 'lg:col-span-5' : 'lg:col-span-7'}`}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <label htmlFor="sermon-input" className="text-lg font-bold font-serif flex items-center gap-2">
                <BrainCircuit size={20} className="text-stone-600" />
                설교 본문 또는 요약
              </label>
              {result && (
                <button 
                  onClick={() => setResult(null)}
                  className="text-sm text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={14} /> 다시 분석하기
                </button>
              )}
            </div>
            
            <input
              type="text"
              id="sermon-title"
              value={sermonTitle}
              onChange={(e) => setSermonTitle(e.target.value)}
              placeholder="설교 제목 (선택 사항)"
              className="w-full p-3 mb-4 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-shadow transition-colors"
              disabled={isAnalyzing}
            />

            <textarea
              id="sermon-input"
              value={sermonText}
              onChange={(e) => setSermonText(e.target.value)}
              placeholder="분석할 설교의 녹취록, 설교 원고, 또는 상세한 요약본을 이곳에 붙여넣어 주세요..."
              className="flex-1 w-full p-4 bg-stone-50 border border-stone-200 rounded-xl resize-none min-h-[300px] focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-shadow transition-colors"
              disabled={isAnalyzing}
            />
            
            {error && (
              <div className="mt-4 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-start gap-2 text-sm">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
            
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !sermonText.trim()}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white py-4 px-6 rounded-xl font-medium transition-all"
            >
              {isAnalyzing ? (
                <>
                  <Activity className="animate-spin" size={20} />
                  분석 중입니다...
                </>
              ) : (
                <>
                  <Send size={20} />
                  맥아더적 관점으로 분석하기
                </>
              )}
            </button>
          </div>
        </section>

        {/* Info Column (Visible when !result) */}
        {!result && (
          <section className="col-span-1 lg:col-span-5 flex flex-col gap-6">
            <div className="bg-stone-50/80 p-6 rounded-2xl shadow-sm border border-stone-200">
              <h3 className="text-xl font-bold font-serif mb-4 flex items-center gap-2 text-stone-800">
                <Info size={24} className="text-amber-500" />
                맥아더 지수란?
              </h3>
              <p className="text-stone-600 mb-6 text-sm leading-relaxed">
                존 맥아더 목사의 강해설교 마스터 클래스 철학을 반영하여 평가되는 신학적 일치도를 나타냅니다. 설교가 하나님의 말씀을 대언하는지에 초점을 맞춥니다.
              </p>
              
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 text-sm mb-1">1. 하나님의 권위</h4>
                  <p className="text-xs text-stone-500">인간적인 철학이나 생각으로 대체하지 않고, 하나님께서 원래 의도하신 본문의 의미를 충분히 전달하는가?</p>
                </div>
                
                <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 text-sm mb-1">2. 본문의 원래 의미 (석의)</h4>
                  <p className="text-xs text-stone-500">현대적 상황에 억지로 끼워 맞추기보다는, 언어나 역사적 간극을 메우며 성경 본연의 의미를 올바르게 도출하는가?</p>
                </div>
                
                <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 text-sm mb-1">3. 그리스도 중심성</h4>
                  <p className="text-xs text-stone-500">강해를 통해 모든 성경의 중심이 되시는 성령의 영감이자 하나님의 아들이신 예수 그리스도를 높이고 있는가?</p>
                </div>
                
                <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 text-sm mb-1">4. 성령의 사역과 적용</h4>
                  <p className="text-xs text-stone-500">인위적으로 개인적인 적용을 남발하기보다 성령께서 직접 말씀을 통해 회중에게 역사하시도록 원리를 선포하는가?</p>
                </div>
                
                <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 text-sm mb-1">5. 설교자의 겸손</h4>
                  <p className="text-xs text-stone-500">설교자가 주인공이 되지 않고 자신을 감추며, 철저히 말씀을 대언하는 도구로만 쓰임받고 있는가?</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Results Column */}
        <AnimatePresence>
          {result && (
            <motion.section 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="lg:col-span-7 flex flex-col gap-6"
            >
              {/* Score Header */}
              <div className="flex flex-col gap-4 bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold tracking-wider text-stone-500 mb-1">맥아더 지수</span>
                    <h2 className="text-3xl font-serif font-bold text-stone-800">강해설교 일치도</h2>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-6xl font-bold font-serif tabular-nums tracking-tighter ${getScoreColor(result.macArthurIndex)}`}>
                      {result.macArthurIndex}
                    </span>
                    <span className="text-2xl font-bold text-stone-400">%</span>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                  <button
                    onClick={handleDownloadPDF}
                    className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-stone-50 font-medium"
                  >
                    <Download size={16} />
                    PDF 다운로드
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-stone-50 font-medium"
                  >
                    <Share2 size={16} />
                    결과 공유하기
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                <h3 className="text-lg font-bold font-serif mb-4 flex items-center gap-2 border-b border-stone-100 pb-3">
                  <span className="w-1.5 h-6 bg-stone-800 rounded-full inline-block"></span>
                  설교 요약
                </h3>
                <p className="text-stone-600 leading-relaxed text-sm md:text-base">
                  {result.summary}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Strengths */}
                <div className="bg-emerald-50/50 p-6 rounded-2xl shadow-sm border border-emerald-100">
                  <h3 className="text-emerald-800 text-lg font-bold font-serif mb-4 flex items-center gap-2">
                    <CheckCircle size={20} className="text-emerald-600" />
                    강점
                  </h3>
                  <ul className="space-y-3">
                    {result.strengths.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-emerald-900 leading-relaxed">
                        <ChevronRight size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Concerns */}
                <div className="bg-rose-50/50 p-6 rounded-2xl shadow-sm border border-rose-100">
                  <h3 className="text-rose-800 text-lg font-bold font-serif mb-4 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-rose-600" />
                    우려 및 비판
                  </h3>
                  <ul className="space-y-3">
                    {result.concerns.map((concern, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-rose-900 leading-relaxed">
                        <ChevronRight size={16} className="text-rose-500 shrink-0 mt-0.5" />
                        <span>{concern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Evaluation */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-stone-50 rounded-full transform translate-x-16 -translate-y-16 pointer-events-none"></div>
                <h3 className="text-lg font-bold font-serif mb-4 flex items-center gap-2 border-b border-stone-100 pb-3 relative z-10">
                  <span className="w-1.5 h-6 bg-amber-500 rounded-full inline-block"></span>
                  총평 및 개선 제언
                </h3>
                <p className="text-stone-700 leading-relaxed text-base relative z-10 whitespace-pre-wrap">
                  {result.evaluation}
                </p>
              </div>

              {/* Reconstruct Action */}
              {!reconstructedSermon ? (
                <button
                  onClick={handleReconstruct}
                  disabled={isReconstructing}
                  className="w-full bg-stone-800 hover:bg-stone-900 disabled:bg-stone-400 text-amber-400 py-5 rounded-2xl shadow-sm border border-stone-700 flex items-center justify-center gap-3 transition-colors font-medium text-lg"
                >
                  {isReconstructing ? (
                    <>
                      <Activity className="animate-spin text-amber-500" size={24} />
                      <span className="text-stone-200">맥아더 스타일로 다시 작성 중...</span>
                    </>
                  ) : (
                    <>
                      <MessageSquareQuote size={24} className="text-amber-500" />
                      <span className="text-stone-200">존 맥아더라면 어떻게 설교했을까? (설교문 재구성)</span>
                    </>
                  )}
                </button>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-stone-900 text-stone-100 p-8 rounded-2xl shadow-lg border border-stone-700 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 opacity-5 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
                    <BookOpen size={240} />
                  </div>
                  <h3 className="text-2xl font-bold font-serif mb-6 flex items-center gap-3 border-b border-stone-700 pb-4 text-amber-400 relative z-10">
                    <MessageSquareQuote size={28} />
                    재구성된 강해설교문 (MacArthur Style)
                  </h3>
                  <div className="prose prose-invert prose-stone max-w-none relative z-10 leading-relaxed text-[15px]">
                    <Markdown>{reconstructedSermon}</Markdown>
                  </div>
                  
                  <div className="mt-8 border-t border-stone-700 pt-6 relative z-10 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleExpandSermon}
                      disabled={isExpanding}
                      className="flex-1 px-6 py-3 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-800/50 border border-stone-600 rounded-xl text-stone-200 flex items-center justify-center gap-2 transition-colors font-medium text-sm"
                    >
                      {isExpanding ? (
                        <>
                          <Activity className="animate-spin text-amber-500" size={18} />
                          <span>권위 강화 및 예화 추가로 30분 분량 확장 중...</span>
                        </>
                      ) : (
                        <>
                          <BookOpen size={18} className="text-amber-500" />
                          <span>예화를 추가하여 30분 분량으로 확장하기</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDownloadDocx}
                      className="px-6 py-3 bg-stone-100 hover:bg-white border border-stone-200 rounded-xl text-stone-800 flex items-center justify-center gap-2 transition-colors font-bold text-sm shadow-sm"
                    >
                      <Download size={18} className="text-stone-700" />
                      <span>DOCX 문서로 다운로드</span>
                    </button>
                  </div>
                </motion.div>
              )}

            </motion.section>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
