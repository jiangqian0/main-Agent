/**
 * doc-generator.js — 文档生成与预览模块
 *
 * Features:
 *   - Generate documents in PDF / DOCX / PPT / Markdown formats
 *   - Built-in document preview modal (PDF viewer, PPT slide show, DOCX HTML)
 *   - Document templates (Cost Report, Security Audit, Deployment Guide, etc.)
 *   - Real-time generation progress
 *   - Download generated documents
 *
 * Integration:
 *   - Called from Chat: user asks to "generate a PDF report"
 *   - Backend API: POST /api/docs/generate
 *   - Returns: { download_url, preview_url, format, title }
 *
 *   window.DocGenerator.generate({ title, content, format, template })
 *   window.DocGenerator.preview({ url, format, title })
 *   window.DocGenerator.download({ url, filename })
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'agent_documents';

  // ─── State ─────────────────────────────────────────────────────────────────

  const _state = {
    documents: [],
    currentDoc: null,
    isGenerating: false,
    generationProgress: 0,
  };

  try {
    _state.documents = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    _state.documents = [];
  }

  // ─── Document Templates ─────────────────────────────────────────────────────

  const TEMPLATES = {
    cost_report: {
      name: 'Cost Report',
      icon: 'fa-chart-line',
      color: '#F59E0B',
      sections: [
        { title: 'Executive Summary', placeholder: 'Brief overview of total costs and key findings...' },
        { title: 'Resource Breakdown', placeholder: 'Detailed cost breakdown by resource type...' },
        { title: 'Trend Analysis', placeholder: 'Month-over-month cost trends and patterns...' },
        { title: 'Optimization Recommendations', placeholder: 'Specific recommendations to reduce costs...' },
        { title: 'Action Items', placeholder: 'Action items with estimated savings...' },
      ],
    },
    security_audit: {
      name: 'Security Audit Report',
      icon: 'fa-shield-halved',
      color: '#EF4444',
      sections: [
        { title: 'Scope & Methodology', placeholder: 'Systems audited and methodology used...' },
        { title: 'Findings', placeholder: 'Security vulnerabilities found...' },
        { title: 'Risk Assessment', placeholder: 'Risk levels for each finding...' },
        { title: 'Recommendations', placeholder: 'Remediation steps for each finding...' },
        { title: 'Compliance Status', placeholder: 'Compliance with security standards...' },
      ],
    },
    deployment_guide: {
      name: 'Deployment Guide',
      icon: 'fa-rocket',
      color: '#10B981',
      sections: [
        { title: 'Prerequisites', placeholder: 'Required resources, credentials, and environment setup...' },
        { title: 'Architecture Overview', placeholder: 'System architecture and component descriptions...' },
        { title: 'Step-by-Step Instructions', placeholder: 'Detailed deployment steps...' },
        { title: 'Configuration', placeholder: 'Environment variables and configuration settings...' },
        { title: 'Verification', placeholder: 'How to verify successful deployment...' },
        { title: 'Rollback Procedure', placeholder: 'Steps to rollback if issues occur...' },
      ],
    },
    weekly_report: {
      name: 'Weekly Status Report',
      icon: 'fa-calendar-week',
      color: '#3B82F6',
      sections: [
        { title: 'Summary', placeholder: 'Overview of this week\'s work...' },
        { title: 'Accomplishments', placeholder: 'Completed tasks and deliverables...' },
        { title: 'In Progress', placeholder: 'Ongoing work and next steps...' },
        { title: 'Blockers', placeholder: 'Issues or blockers encountered...' },
        { title: 'Next Week Plan', placeholder: 'Planned work for next week...' },
      ],
    },
    api_docs: {
      name: 'API Documentation',
      icon: 'fa-code',
      color: '#8B5CF6',
      sections: [
        { title: 'Overview', placeholder: 'API purpose and base URL...' },
        { title: 'Authentication', placeholder: 'How to authenticate requests...' },
        { title: 'Endpoints', placeholder: 'List of available endpoints with methods...' },
        { title: 'Request/Response Examples', placeholder: 'Example requests and responses...' },
        { title: 'Error Codes', placeholder: 'Error codes and their meanings...' },
      ],
    },
    meeting_notes: {
      name: 'Meeting Notes',
      icon: 'fa-users',
      color: '#0EA5E9',
      sections: [
        { title: 'Attendees', placeholder: 'Participants in the meeting...' },
        { title: 'Agenda', placeholder: 'Topics discussed...' },
        { title: 'Decisions Made', placeholder: 'Key decisions and rationale...' },
        { title: 'Action Items', placeholder: 'Tasks assigned with owners and deadlines...' },
        { title: 'Next Meeting', placeholder: 'Date and topics for next meeting...' },
      ],
    },
  };

  // ─── Generate Document ─────────────────────────────────────────────────────

  async function generate(options) {
    if (_state.isGenerating) {
      showDocToast('A document is already being generated', 'error');
      return null;
    }

    const opts = {
      title: options.title || 'Untitled Document',
      content: options.content || '',
      format: options.format || 'pdf',
      template: options.template || null,
      sections: options.sections || null,
    };

    _state.isGenerating = true;
    _state.generationProgress = 0;
    dispatchProgress(0, 'Preparing document...');

    try {
      // Call backend API
      const resp = await fetch('/api/docs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Generation failed');
      }

      dispatchProgress(90, 'Finalizing...');
      const result = await resp.json();

      // Save to local state
      const doc = {
        id: 'doc-' + Date.now(),
        title: opts.title,
        format: opts.format,
        template: opts.template,
        url: result.download_url || result.url,
        preview_url: result.preview_url,
        content: opts.content,
        created_at: new Date().toISOString(),
        size: result.size || 0,
      };

      _state.documents.unshift(doc);
      saveDocuments();
      dispatchProgress(100, 'Complete!');

      // Add generated document to Code Panel
      if (window.CodePanel && doc.url) {
        var ext = doc.format === 'pptx' ? 'pptx' : doc.format;
        window.CodePanel.addFile({
          path: opts.title + '.' + ext,
          content: '[Generated document — see ' + doc.url + ']',
          language: ext,
        });
      }

      showDocToast('Document generated: ' + opts.title);
      window.dispatchEvent(new CustomEvent('docs:generated', { detail: doc }));

      return doc;
    } catch (e) {
      showDocToast(e.message || 'Generation failed', 'error');
      return null;
    } finally {
      _state.isGenerating = false;
      _state.generationProgress = 0;
    }
  }

  // ─── Generate from Template ────────────────────────────────────────────────

  async function generateFromTemplate(templateId, customContent) {
    const tmpl = TEMPLATES[templateId];
    if (!tmpl) {
      showDocToast('Unknown template: ' + templateId, 'error');
      return null;
    }

    // Build content from template sections
    let fullContent = '# ' + tmpl.name + '\n\n';
    if (customContent) {
      tmpl.sections.forEach(function (sec) {
        var val = customContent[sec.title] || sec.placeholder;
        fullContent += '## ' + sec.title + '\n\n' + val + '\n\n';
      });
    }

    return generate({
      title: tmpl.name + ' - ' + new Date().toLocaleDateString(),
      content: fullContent,
      format: 'pdf',
      template: templateId,
    });
  }

  // ─── Preview Document ──────────────────────────────────────────────────────

  function preview(docOrUrl, format, title) {
    var doc;
    if (typeof docOrUrl === 'object') {
      doc = docOrUrl;
    } else {
      doc = { url: docOrUrl, format: format, title: title };
    }

    _state.currentDoc = doc;
    var overlay = document.getElementById('doc-preview-overlay');
    if (!overlay) {
      injectPreviewModal();
      overlay = document.getElementById('doc-preview-overlay');
    }

    var previewArea = document.getElementById('doc-preview-area');
    var previewTitle = document.getElementById('doc-preview-title');

    if (previewTitle) previewTitle.textContent = doc.title || 'Document Preview';
    if (!previewArea) return;

    if (doc.format === 'pdf' || (doc.url && doc.url.endsWith('.pdf'))) {
      previewArea.innerHTML =
        '<div class="doc-preview-pdf">' +
          '<iframe id="doc-preview-iframe" src="' + (doc.preview_url || doc.url) + '" width="100%" height="100%" style="border:none;"></iframe>' +
        '</div>';
    } else if (doc.format === 'ppt' || doc.format === 'pptx' || (doc.url && (doc.url.endsWith('.pptx') || doc.url.endsWith('.ppt')))) {
      previewArea.innerHTML =
        '<div class="doc-preview-slides">' +
          '<div class="doc-ppt-placeholder">' +
            '<i class="fa-solid fa-presentation" style="font-size:48px;color:var(--border-color)"></i>' +
            '<p>PowerPoint Preview</p>' +
            '<a href="' + (doc.url || doc.preview_url) + '" download class="btn btn-primary" style="margin-top:12px">' +
              '<i class="fa-solid fa-download"></i> Download PPT' +
            '</a>' +
          '</div>' +
        '</div>';
    } else {
      // Markdown / DOCX / text — render as HTML
      var content = doc.content || doc.preview_url || '';
      previewArea.innerHTML =
        '<div class="doc-preview-markdown" id="doc-preview-content">' +
          renderDocMarkdown(content) +
        '</div>';
    }

    overlay.classList.add('show');
    window.dispatchEvent(new CustomEvent('docs:preview', { detail: doc }));
  }

  function closePreview() {
    var overlay = document.getElementById('doc-preview-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  function renderDocMarkdown(content) {
    if (!content) return '<p style="color:var(--grey);text-align:center;padding:40px;">No content to preview</p>';
    // Basic markdown rendering
    var html = escHtml(content)
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '</p><p>');
    return '<p>' + html + '</p>';
  }

  // ─── Download ──────────────────────────────────────────────────────────────

  function download(url, filename) {
    if (!url) return;
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || url.split('/').pop();
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showDocToast('Download started: ' + a.download);
  }

  // ─── Preview Modal Injection ───────────────────────────────────────────────

  function injectPreviewModal() {
    if (document.getElementById('doc-preview-overlay')) return;
    var modal = document.createElement('div');
    modal.id = 'doc-preview-overlay';
    modal.className = 'dialog-overlay doc-preview-overlay';
    modal.innerHTML =
      '<div class="dialog doc-preview-dialog">' +
        '<div class="dialog-header">' +
          '<h3 id="doc-preview-title"><i class="fa-solid fa-file-lines"></i> Document Preview</h3>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<button class="dialog-action-btn" id="doc-preview-download-btn" onclick="window.DocGenerator.downloadCurrent()" title="Download"><i class="fa-solid fa-download"></i></button>' +
            '<button class="dialog-close" onclick="window.DocGenerator.closePreview()">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="doc-preview-area" id="doc-preview-area"></div>' +
        '<div class="doc-preview-toolbar" id="doc-preview-toolbar">' +
          '<button class="doc-preview-nav-btn" onclick="window.DocGenerator.prevSlide()"><i class="fa-solid fa-chevron-left"></i></button>' +
          '<span class="doc-preview-page" id="doc-preview-page">1 / 1</span>' +
          '<button class="doc-preview-nav-btn" onclick="window.DocGenerator.nextSlide()"><i class="fa-solid fa-chevron-right"></i></button>' +
          '<div style="flex:1"></div>' +
          '<button class="btn btn-outline" onclick="window.DocGenerator.closePreview()">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  function downloadCurrent() {
    if (_state.currentDoc) {
      download(_state.currentDoc.url || _state.currentDoc.preview_url, _state.currentDoc.title);
    }
  }

  function prevSlide() { /* PPT navigation placeholder */ }
  function nextSlide() { /* PPT navigation placeholder */ }

  // ─── Progress Dispatch ─────────────────────────────────────────────────────

  function dispatchProgress(pct, label) {
    _state.generationProgress = pct;
    window.dispatchEvent(new CustomEvent('docs:progress', {
      detail: { percent: pct, label: label || '' }
    }));
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  function getDocuments() {
    return _state.documents;
  }

  function deleteDocument(id) {
    _state.documents = _state.documents.filter(function (d) { return d.id !== id; });
    saveDocuments();
    showDocToast('Document deleted');
  }

  function saveDocuments() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state.documents));
  }

  // ─── Document Creation UI ───────────────────────────────────────────────────

  function renderCreateDialog(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var templatesHtml = Object.keys(TEMPLATES).map(function (key) {
      var t = TEMPLATES[key];
      return '<div class="doc-template-card" onclick="window.DocGenerator.selectTemplate(\'' + key + '\', this)">' +
        '<div class="doc-template-icon" style="background:' + t.color + '15;color:' + t.color + '">' +
          '<i class="fa-solid ' + t.icon + '"></i>' +
        '</div>' +
        '<span class="doc-template-name">' + t.name + '</span>' +
      '</div>';
    }).join('');

    container.innerHTML =
      '<div class="doc-create-form">' +
        '<div class="form-group">' +
          '<label>Document Title</label>' +
          '<input type="text" id="dc-title" placeholder="e.g., Monthly Cost Report 2026-05">' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Output Format</label>' +
          '<div class="doc-format-selector">' +
            '<button class="doc-format-btn active" data-format="pdf" onclick="window.DocGenerator.selectFormat(\'pdf\', this)"><i class="fa-solid fa-file-pdf"></i> PDF</button>' +
            '<button class="doc-format-btn" data-format="docx" onclick="window.DocGenerator.selectFormat(\'docx\', this)"><i class="fa-solid fa-file-word"></i> DOCX</button>' +
            '<button class="doc-format-btn" data-format="pptx" onclick="window.DocGenerator.selectFormat(\'pptx\', this)"><i class="fa-solid fa-presentation"></i> PPTX</button>' +
            '<button class="doc-format-btn" data-format="md" onclick="window.DocGenerator.selectFormat(\'md\', this)"><i class="fa-solid fa-file-code"></i> Markdown</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Template (Optional)</label>' +
          '<div class="doc-template-grid">' + templatesHtml + '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Content</label>' +
          '<textarea id="dc-content" rows="10" placeholder="Enter document content or let AI generate it..."></textarea>' +
        '</div>' +
        '<div class="form-group" id="dc-template-sections"></div>' +
        '<div class="doc-generation-progress" id="dc-progress" style="display:none">' +
          '<div class="doc-progress-bar"><div class="doc-progress-fill" id="dc-progress-fill"></div></div>' +
          '<p class="doc-progress-label" id="dc-progress-label">Preparing...</p>' +
        '</div>' +
      '</div>';
  }

  function selectFormat(fmt, btn) {
    document.querySelectorAll('.doc-format-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    window._selectedDocFormat = fmt;
  }

  function selectTemplate(tmplId, cardEl) {
    document.querySelectorAll('.doc-template-card').forEach(function (c) { c.classList.remove('active'); });
    if (cardEl) cardEl.classList.add('active');
    window._selectedDocTemplate = tmplId;

    // Show template sections
    var tmpl = TEMPLATES[tmplId];
    var sectionsEl = document.getElementById('dc-template-sections');
    if (!sectionsEl || !tmpl) return;

    sectionsEl.innerHTML = '<label>Template Sections</label>' +
      tmpl.sections.map(function (sec) {
        return '<div class="form-group" style="margin-bottom:8px">' +
          '<label style="font-size:12px;color:var(--grey)">' + sec.title + '</label>' +
          '<textarea id="dc-sec-' + escAttr(sec.title) + '" rows="2" placeholder="' + sec.placeholder + '"></textarea>' +
        '</div>';
      }).join('');
  }

  async function createFromDialog() {
    var title = document.getElementById('dc-title').value.trim() || 'Untitled';
    var content = document.getElementById('dc-content').value.trim();
    var format = window._selectedDocFormat || 'pdf';
    var tmplId = window._selectedDocTemplate;

    var sections = null;
    if (tmplId && TEMPLATES[tmplId]) {
      sections = {};
      TEMPLATES[tmplId].sections.forEach(function (sec) {
        var el = document.getElementById('dc-sec-' + escAttr(sec.title));
        sections[sec.title] = el ? el.value.trim() : '';
      });
    }

    var progressEl = document.getElementById('dc-progress');
    var fillEl = document.getElementById('dc-progress-fill');
    var labelEl = document.getElementById('dc-progress-label');

    if (progressEl) progressEl.style.display = '';

    window.addEventListener('docs:progress', function onProgress(e) {
      if (fillEl) fillEl.style.width = e.detail.percent + '%';
      if (labelEl) labelEl.textContent = e.detail.label || 'Generating...';
    });

    var result = await generate({ title: title, content: content, format: format, sections: sections, template: tmplId });
    if (result) {
      closeCreateDialog();
    }

    window.removeEventListener('docs:progress', onProgress);
    if (progressEl) progressEl.style.display = 'none';
  }

  function closeCreateDialog() {
    var overlay = document.getElementById('doc-create-overlay');
    if (overlay) overlay.classList.remove('show');
    window._selectedDocFormat = 'pdf';
    window._selectedDocTemplate = null;
  }

  function showCreateDialog() {
    injectCreateDialog();
    renderCreateDialog('doc-create-body');
    document.getElementById('doc-create-overlay').classList.add('show');
  }

  function injectCreateDialog() {
    if (document.getElementById('doc-create-overlay')) return;
    var modal = document.createElement('div');
    modal.id = 'doc-create-overlay';
    modal.className = 'dialog-overlay';
    modal.innerHTML =
      '<div class="dialog" style="max-width:680px">' +
        '<div class="dialog-header">' +
          '<h3><i class="fa-solid fa-file-plus"></i> Create Document</h3>' +
          '<button class="dialog-close" onclick="window.DocGenerator.closeCreateDialog()">&times;</button>' +
        '</div>' +
        '<div class="dialog-body" id="doc-create-body" style="max-height:60vh;overflow-y:auto"></div>' +
        '<div class="dialog-footer">' +
          '<button class="btn btn-outline" onclick="window.DocGenerator.closeCreateDialog()">Cancel</button>' +
          '<button class="btn btn-primary" onclick="window.DocGenerator.createFromDialog()">' +
            '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Document' +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────

  function showDocToast(msg, type) {
    var container = document.getElementById('doc-toast-container');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'doc-toast ' + (type || '');
    t.innerHTML = '<i class="fa-solid fa-' + (type === 'error' ? 'xmark' : 'check') + '"></i>' + escHtml(msg);
    container.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  window.DocGenerator = {
    generate: generate,
    generateFromTemplate: generateFromTemplate,
    preview: preview,
    closePreview: closePreview,
    download: download,
    downloadCurrent: downloadCurrent,
    getDocuments: getDocuments,
    deleteDocument: deleteDocument,
    showCreateDialog: showCreateDialog,
    closeCreateDialog: closeCreateDialog,
    renderCreateDialog: renderCreateDialog,
    selectFormat: selectFormat,
    selectTemplate: selectTemplate,
    createFromDialog: createFromDialog,
    get templates() { return TEMPLATES; },
    get state() { return _state; },
  };

})();
