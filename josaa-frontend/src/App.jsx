import { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, FileText, Filter, RotateCcw, Search, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

const hsKeywords = {
  "Andhra Pradesh": ["andhra pradesh", "tadepalligudem"],
  "Arunachal Pradesh": ["arunachal"],
  "Assam": ["silchar", "tezpur", "guwahati"],
  "Bihar": ["patna", "bhagalpur"],
  "Chandigarh": ["chandigarh", "pec"],
  "Chhattisgarh": ["raipur", "bilaspur", "naya raipur"],
  "Delhi": ["delhi", "new delhi"],
  "Goa": ["goa"],
  "Gujarat": ["surat", "vadodara", "gandhinagar"],
  "Haryana": ["kurukshetra", "sonepat"],
  "Himachal Pradesh": ["hamirpur", "una"],
  "Jammu and Kashmir": ["srinagar", "jammu", "katra"],
  "Jharkhand": ["jamshedpur", "mesra", "ranchi"],
  "Karnataka": ["surathkal", "raichur", "dharwad"],
  "Kerala": ["calicut", "kottayam", "palakkad"],
  "Madhya Pradesh": ["bhopal", "jabalpur", "gwalior"],
  "Maharashtra": ["nagpur", "pune", "aurangabad", "mumbai"],
  "Manipur": ["manipur", "senapati"],
  "Meghalaya": ["meghalaya", "shillong"],
  "Mizoram": ["mizoram"],
  "Nagaland": ["nagaland"],
  "Odisha": ["rourkela", "bhubaneswar"],
  "Puducherry": ["puducherry", "karaikal"],
  "Punjab": ["jalandhar", "rupnagar", "amritsar"],
  "Rajasthan": ["jaipur", "kota"],
  "Sikkim": ["sikkim"],
  "Tamil Nadu": ["tiruchirappalli", "kancheepuram", "trichy", "chennai"],
  "Telangana": ["warangal"],
  "Tripura": ["agartala"],
  "Uttar Pradesh": ["allahabad", "prayagraj", "lucknow", "kanpur", "varanasi"],
  "Uttarakhand": ["uttarakhand", "srinagar (garhwal)", "roorkee"],
  "West Bengal": ["durgapur", "shibpur", "kalyani", "kharagpur"]
};

function App() {
  const [mainRank, setMainRank] = useState("");
  const [advRank, setAdvRank] = useState("");
  const [category, setCategory] = useState("OPEN");
  const [gender, setGender] = useState("Gender-Neutral");
  const [homeState, setHomeState] = useState("None");
  
  const [instituteType, setInstituteType] = useState("All");
  const [searchBranch, setSearchBranch] = useState("");
  const [roundNo, setRoundNo] = useState("6");
  const [safeOnly, setSafeOnly] = useState(false);
  const [strictEligibility, setStrictEligibility] = useState(true);
  
  const [masterData, setMasterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortCol, setSortCol] = useState("closing_rank");
  const [sortDir, setSortDir] = useState("asc");

  const API_BASE_URL = "https://josaa-backend-api.onrender.com"; 

  // 🔥 THE FIX: Unified Single-Fetch Architecture
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      setError("");
      try {
        const encCat = encodeURIComponent(category);
        const encGen = encodeURIComponent(gender);

        // Fetch ALL programs for this Round/Category/Gender in one go
        const res = await fetch(`${API_BASE_URL}/predict?rank=0&category=${encCat}&gender=${encGen}&round_no=${roundNo}`);
        
        if (res.ok) {
          const result = await res.json();
          if (result.predictions) {
            // Intelligently tag them locally
            const allColleges = result.predictions.map(c => {
              const rawName = (c.institute_name || "").toLowerCase().replace(/[^a-z]/g, '');
              const isIIT = rawName.includes("indianinstituteoftechnology") || 
                            rawName.includes("ismdhanbad") || 
                            (c.institute_name || "").includes("IIT");
              
              return { ...c, exam: isIIT ? "JEE Adv" : "JEE Main" };
            });
            setMasterData(allColleges);
          }
        }
      } catch (err) {
        setError("Database offline. Check your Render server.");
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [category, gender, roundNo]); 

  const isCollegeInHomeState = (instName, stateStr) => {
    if (stateStr === "None") return false;
    const keywords = hsKeywords[stateStr] || [];
    return keywords.some(kw => instName.toLowerCase().includes(kw));
  };

  const filteredAndSortedData = useMemo(() => {
    let result = [...masterData];

    if (instituteType !== "All") {
      result = result.filter(d => {
        if (instituteType === "IIT") return d.exam === "JEE Adv";
        if (instituteType === "NIT") return d.institute_name.includes("National Institute of Technology");
        if (instituteType === "IIIT") return d.institute_name.includes("Indian Institute of Information Technology");
        return true;
      });
    }

    result = result.filter(d => {
      const hasMain = mainRank !== "";
      const hasAdv = advRank !== "";

      if (!hasMain && !hasAdv) return true;

      if (hasMain && !hasAdv) {
        if (d.exam === "JEE Adv") return false; 
        return d.closing_rank >= Number(mainRank);
      }

      if (!hasMain && hasAdv) {
        if (d.exam === "JEE Main") return false; 
        return d.closing_rank >= Number(advRank);
      }

      if (hasMain && hasAdv) {
        if (d.exam === "JEE Adv") return d.closing_rank >= Number(advRank);
        if (d.exam === "JEE Main") return d.closing_rank >= Number(mainRank);
      }

      return true;
    });

    if (strictEligibility && homeState !== "None") {
      result = result.filter(d => {
        if (d.quota === "AI" || d.quota === "GO") return true;
        const isHSCollege = isCollegeInHomeState(d.institute_name, homeState);
        if (d.quota === "HS") return isHSCollege;
        if (d.quota === "OS") return !isHSCollege;
        return true; 
      });
    }

    if (searchBranch.trim() !== "") {
      const lower = searchBranch.toLowerCase();
      result = result.filter(d => d.academic_program && d.academic_program.toLowerCase().includes(lower));
    }

    if (safeOnly) {
      result = result.filter(d => {
        const appliedRank = d.exam === "JEE Adv" ? Number(advRank) : Number(mainRank);
        if (!appliedRank) return false;
        return d.closing_rank >= appliedRank * 1.1;
      });
    }

    result.sort((a, b) => {
      let valA = a[sortCol];
      let valB = b[sortCol];
      if (typeof valA === "string") return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortDir === "asc" ? valA - valB : valB - valA;
    });

    return result;
  }, [masterData, instituteType, mainRank, advRank, strictEligibility, homeState, searchBranch, safeOnly, sortCol, sortDir]);

  const handleReset = () => {
    setMainRank("");
    setAdvRank("");
    setHomeState("None");
    setInstituteType("All");
    setSearchBranch("");
    setRoundNo("6");
    setSafeOnly(false);
    setStrictEligibility(true);
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const getStatus = (closing, examType) => {
    const appliedRank = examType === "JEE Adv" ? advRank : mainRank;
    if (!appliedRank) return { text: "-", class: "bg-gray-800 text-gray-400 border-gray-700" };
    if (closing >= Number(appliedRank) * 1.1) return { text: "Safe", class: "bg-green-500/10 text-green-400 border border-green-500/30" };
    return { text: "Border", class: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30" };
  };

  const exportCSV = () => {
    const csvData = filteredAndSortedData.map(d => ({
      Institute: d.institute_name, Program: d.academic_program, Quota: d.quota,
      Category: d.category, Gender: d.gender, "Closing Rank": d.closing_rank, "Exam Used": d.exam
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `josaa_predictions_round_${roundNo}.csv`); document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`JoSAA Rank Predictions (Round ${roundNo})`, 14, 15);
    const tableColumn = ["Institute", "Program", "Quota", "Cat", "Closing", "Exam"];
    const tableRows = filteredAndSortedData.map(d => [
      d.institute_name ? d.institute_name.replace("Indian Institute of Technology", "IIT").replace("National Institute of Technology", "NIT").replace("Indian Institute of Information Technology", "IIIT") : "N/A",
      d.academic_program ? d.academic_program.substring(0, 30) + "..." : "N/A",
      d.quota, d.category, d.closing_rank, d.exam
    ]);
    autoTable(doc, { head: [tableColumn], body: tableRows, startY: 20, styles: { fontSize: 8 }, headStyles: { fillColor: [0, 229, 255], textColor: [0,0,0] } });
    doc.save(`josaa_predictions_round_${roundNo}.pdf`);
  };

  const renderSortIcon = (col) => {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={14} className="inline ml-1 text-cyan-400" /> : <ChevronDown size={14} className="inline ml-1 text-cyan-400" />;
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-300 font-sans flex flex-col lg:flex-row p-4 lg:p-6 gap-6">
      
      {/* ---------------- SIDEBAR (LEFT) ---------------- */}
      <aside className="w-full lg:w-[340px] flex-shrink-0 flex flex-col gap-6">
        <div className="px-2">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-tight mb-1">JoSAA Engine</h1>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 tracking-wider uppercase">
            Actual JoSAA 2025 Data {loading && <Loader2 size={12} className="animate-spin text-cyan-400" />}
          </div>
        </div>

        <div className="bg-[#131825] border border-gray-800/60 rounded-xl p-5 shadow-lg flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 mb-4 text-gray-200 font-semibold text-sm"><Filter size={18} className="text-gray-400" /> Your Profile</div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500 appearance-none">
                  <option value="OPEN">OPEN</option><option value="OBC-NCL">OBC-NCL</option>
                  <option value="EWS">EWS</option><option value="SC">SC</option><option value="ST">ST</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Home State (Eligibility)</label>
                <select value={homeState} onChange={(e) => setHomeState(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500 appearance-none">
                  <option value="None">Select State (Default AI/OS)</option>
                  {Object.keys(hsKeywords).map(state => (<option key={state} value={state}>{state}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">JEE Main Rank</label>
                  <input type="number" placeholder="e.g. 15000" value={mainRank} onChange={(e) => setMainRank(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">JEE Adv Rank</label>
                  <input type="number" placeholder="e.g. 4000" value={advRank} onChange={(e) => setAdvRank(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-800/60 my-1"></div>

          <div>
            <div className="flex items-center gap-2 mb-4 text-gray-200 font-semibold text-sm"><Search size={18} className="text-gray-400" /> Advanced Filters</div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">JoSAA Round</label>
                <select value={roundNo} onChange={(e) => setRoundNo(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500 appearance-none">
                  <option value="0">MAX Rank (Across All Rounds)</option>
                  <option value="1">Round 1</option>
                  <option value="2">Round 2</option>
                  <option value="3">Round 3</option>
                  <option value="4">Round 4</option>
                  <option value="5">Round 5</option>
                  <option value="6">Round 6 (Final)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Gender Pool</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500 appearance-none">
                  <option value="Gender-Neutral">All Pools (Gender-Neutral)</option>
                  <option value="Female-only (including Supernumerary)">Female-only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Institute Type</label>
                <select value={instituteType} onChange={(e) => setInstituteType(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500 appearance-none">
                  <option value="All">All Institutes</option><option value="IIT">IITs Only (Uses Adv Rank)</option>
                  <option value="NIT">NITs Only (Uses Main Rank)</option><option value="IIIT">IIITs Only (Uses Main Rank)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Search Branch</label>
                <input type="text" placeholder="e.g. Computer Science" value={searchBranch} onChange={(e) => setSearchBranch(e.target.value)} className="w-full bg-[#0B0F19] border border-gray-700/50 rounded-lg p-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
              </div>
              <div className="flex items-center gap-2 mt-1 cursor-pointer group" onClick={() => setStrictEligibility(!strictEligibility)}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${strictEligibility ? 'bg-cyan-500 border-cyan-500' : 'bg-[#0B0F19] border-gray-700 group-hover:border-gray-500'}`}>
                  {strictEligibility && <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                </div>
                <span className="text-xs text-gray-400 select-none group-hover:text-gray-300 transition-colors">Strict JoSAA Eligibility (Hide Invalid Quotas)</span>
              </div>
              <div className="flex items-center gap-2 mt-1 cursor-pointer group" onClick={() => setSafeOnly(!safeOnly)}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${safeOnly ? 'bg-cyan-500 border-cyan-500' : 'bg-[#0B0F19] border-gray-700 group-hover:border-gray-500'}`}>
                  {safeOnly && <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                </div>
                <span className="text-xs text-gray-400 select-none group-hover:text-gray-300 transition-colors">Show Only Safe Colleges</span>
              </div>
            </div>
          </div>
          <button onClick={handleReset} type="button" className="w-full bg-transparent border border-gray-700 text-gray-300 hover:bg-gray-800/50 font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors mt-2">
            <RotateCcw size={18} /> Reset Filters
          </button>
          {error && <div className="text-red-400 text-xs text-center font-medium p-2 bg-red-950/30 rounded border border-red-900/50">{error}</div>}
        </div>

        <div className="mt-2 text-center select-none">
          <p className="text-[10px] text-gray-500 font-semibold tracking-[0.15em] uppercase">Engineered with <span className="text-cyan-400">⚡</span> by</p>
          <p className="text-[15px] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mt-0.5 tracking-wide">UVAISH</p>
        </div>
      </aside>

      {/* ---------------- MAIN CONTENT (RIGHT) ---------------- */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 mt-2 lg:mt-0">
          <div className="bg-[#131825] border border-gray-800/60 rounded-full px-4 py-1.5 flex items-center shadow-sm">
            <span className="text-[#00E5FF] text-sm font-semibold">{filteredAndSortedData.length} <span className="text-gray-400 font-normal">Programs Available</span></span>
          </div>
          <div className="flex gap-3">
             <button onClick={exportCSV} className="bg-[#131825] border border-gray-800/60 text-gray-300 hover:text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors hover:shadow-[0_0_10px_rgba(255,255,255,0.1)]"><Download size={16} /> CSV</button>
             <button onClick={exportPDF} className="bg-[#131825] border border-gray-800/60 text-gray-300 hover:text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors hover:shadow-[0_0_10px_rgba(255,255,255,0.1)]"><FileText size={16} /> PDF</button>
          </div>
        </div>

        <div className="bg-[#131825] border border-gray-800/60 rounded-xl flex-1 overflow-hidden shadow-xl flex flex-col relative">
          {loading && (
            <div className="absolute inset-0 bg-[#0B0F19]/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
              <Loader2 size={32} className="animate-spin text-cyan-400 mb-4" />
              <p className="text-sm font-semibold text-cyan-400 tracking-wider uppercase">
  {roundNo === "0" ? "Calculating Max Rank Across All Rounds..." : `Loading Round ${roundNo} Data...`}
</p>
            </div>
          )}

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse whitespace-nowrap lg:whitespace-normal">
              <thead>
                <tr className="border-b border-gray-800/80 bg-[#161B28]">
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 transition-colors" onClick={() => handleSort('institute_name')}>Institute {renderSortIcon('institute_name')}</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-[28%] cursor-pointer hover:text-gray-200 transition-colors" onClick={() => handleSort('academic_program')}>Program {renderSortIcon('academic_program')}</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center" onClick={() => handleSort('quota')}>Quota {renderSortIcon('quota')}</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center" onClick={() => handleSort('category')}>Cat {renderSortIcon('category')}</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center" onClick={() => handleSort('gender')}>Gender {renderSortIcon('gender')}</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 transition-colors" onClick={() => handleSort('exam')}>Exam {renderSortIcon('exam')}</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right cursor-pointer hover:text-gray-200 transition-colors" onClick={() => handleSort('closing_rank')}>Closing ^ {renderSortIcon('closing_rank')}</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {!loading && filteredAndSortedData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-12 text-center text-gray-500">
                      <p className="mb-2 text-lg">No matching programs found.</p>
                      <p className="text-sm">Try relaxing your rank filters or clearing the search branch.</p>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedData.map((college, index) => {
                    const shortName = college.institute_name ? college.institute_name.replace("Indian Institute of Technology", "IIT").replace("National Institute of Technology", "NIT").replace("Indian Institute of Information Technology", "IIIT") : "N/A";
                    const status = getStatus(college.closing_rank, college.exam);
                    const shortGender = college.gender === "Gender-Neutral" ? "GN" : "Female";
                    
                    return (
                      <tr key={index} className="hover:bg-[#1A2030] transition-colors group">
                        <td className="p-4 text-sm font-semibold text-gray-200">{shortName}</td>
                        <td className="p-4 text-sm text-gray-400 leading-snug">{college.academic_program}</td>
                        <td className="p-4 text-center"><span className="bg-gray-800/80 text-gray-300 px-2 py-1 rounded text-xs font-bold border border-gray-700/50">{college.quota}</span></td>
                        <td className="p-4 text-center text-xs text-gray-400 font-medium">{college.category}</td>
                        <td className="p-4 text-center text-xs text-gray-400">{shortGender}</td>
                        <td className="p-4 text-sm font-medium text-gray-500"><span className={college.exam === "JEE Adv" ? "text-purple-400" : "text-blue-400"}>{college.exam}</span></td>
                        <td className="p-4 text-sm font-bold text-[#00E5FF] font-mono text-right">{college.closing_rank}</td>
                        <td className="p-4 text-center"><span className={`px-3 py-1 rounded-full text-[11px] font-bold ${status.class}`}>{status.text}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export default App;