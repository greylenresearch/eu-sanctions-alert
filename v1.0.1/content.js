class NameHighlighter {
    constructor() {
      this.targetCaptions = new Set();
      this.nameToInfo = new Map();
      this.isProcessing = false;
      this.currentPopup = null;
      this.popupInfo = null;
    }
  
    async initialize() {
      try {
        this.setupPopupStyles(); // Make sure styles are added first
        await this.loadNames();
        this.processPage();
        this.setupObserver();
        this.setupPopupDismissal();
      } catch (error) {
        console.error('Initialization error:', error);
      }
    }
  
    setupPopupStyles() {
      if (!document.getElementById('highlighter-styles')) {
        const styles = document.createElement('style');
        styles.id = 'highlighter-styles';
        styles.textContent = `
          .name-info-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 8px;
            padding: 12px;
            -webkit-box-shadow: 0 4px 16px rgba(24,29,34,.14);
            box-shadow: 0 4px 16px rgba(24,29,34,.14)
            z-index: 10000;
            min-width: 400px;
            max-width: 400px;
            font-size: 14px;
            line-height: 1.4;
            opacity: 0;
            transform: translateY(-10px);
            transition: opacity 0.2s ease-out, transform 0.2s ease-out;
          }
          .name-info-popup.visible {
            opacity: 1;
            transform: translateY(0);
          }
          .name-info-popup h3 {
            margin: 0 0 8px 0;
            font-size: 16px;
            color: #333;
            font-weight: bold;
          }
        .name-info-popup .info-row {
            margin: 4px 0;
            padding: 4px 0;
            border-bottom: 1px solid whitesmoke;
            color: text-dark;
            display: flex;
            align-items: top;
        }
        .name-info-popup .info-row:last-child {
            border-bottom: none;
        }
        .name-info-popup .label {
            font-weight: bold;
            color: body-text;
            min-width: 120px;
            display: inline-block;
        }
          .name-info-popup .url {
            color: royalblue;
            text-decoration: underline;
            cursor: pointer;
            word-break: break-all;
          }
          .name-info-popup .close-button {
            position: absolute;
            top: 8px;
            right: 8px;
            cursor: pointer;
            color: white;
            border: none;
            background: none;
            font-size: 18px;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 12px;
            transition: background-color 0.2s ease;
          }
          .name-info-popup .close-button:hover {
            background: none;
          }
        `;
        document.head.appendChild(styles);
      }
    }
  
    setupPopupDismissal() {
      document.addEventListener('click', (e) => {
        if (this.currentPopup && !this.currentPopup.contains(e.target) &&
            !e.target.closest('mark[data-caption]')) {
          this.currentPopup.remove();
          this.currentPopup = null;
        }
      });
  
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.currentPopup) {
          this.currentPopup.remove();
          this.currentPopup = null;
        }
      });
    }
  
  
  async loadNames() {
    try {
      // Generate today's date in YYYYMMDD format
      const now = new Date();
      const dateString = now.toISOString().slice(0, 10).replace(/-/g, '');
      
      // Construct the base URL with dynamic date
      const baseUrl = `https://data.opensanctions.org/datasets/${dateString}/eu_fsf/`;
      const baseFilename = 'targets.nested.json';
      
      // Try to fetch the data
      let response = null;
      let attemptCount = 0;
      const maxAttempts = 2; // Try today and yesterday if needed
      
      while (!response?.ok && attemptCount < maxAttempts) {
        try {
          // Generate version timestamp (as a fallback if needed)
          const attemptDate = new Date(now);
          attemptDate.setDate(now.getDate() - attemptCount);
          const attemptDateString = attemptDate.toISOString().slice(0, 10).replace(/-/g, '');
          
          // Construct URL with the attempt date
          const url = `https://data.opensanctions.org/datasets/${attemptDateString}/eu_fsf/${baseFilename}`;
          
          // First try without version parameter
          response = await fetch(url);
          
          // If that fails, try with a generated version parameter
          if (!response.ok) {
            const versionTimestamp = `${attemptDateString}105704-${Math.random().toString(36).substring(2, 5)}`;
            response = await fetch(`${url}?v=${versionTimestamp}`);
          }
        } catch (error) {
          console.error(`Error fetching data for attempt ${attemptCount + 1}:`, error);
        }
        
        attemptCount++;
      }
  
      if (!response.ok) {
        throw new Error('Failed to fetch sanctions data after all attempts');
      }
  
      const fileContent = await response.text();
      const lines = fileContent.trim().split('\n');
  
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry?.caption) {
            const caption = entry.caption.trim();
            const schema = entry.schema || 'Unknown';
            const properties = entry.properties || {};
            const sanctions = properties.sanctions || [];
            const sanction = sanctions[0] || {};
            const sanctionProps = sanction.properties || {};
            const addressEntity = properties.addressEntity?.[0] || {};
            const addressProperties = addressEntity.properties || {};
  
            const nameInfo = {
              caption: caption,  // Keep the original caption
              schema: schema,
              name: properties.name || [],
              // Remove displayName as we'll use caption directly
              otherNames: properties.name?.filter(n => n.toLowerCase() !== caption.toLowerCase()) || [], // Filter out the caption from other names
              birthDate: schema === "Person" ? properties.birthDate?.[0] || 'Not provided' : null,
              gender: schema === "Person" ? (properties.gender?.[0]?.charAt(0).toUpperCase() + properties.gender?.[0]?.slice(1).toLowerCase() || 'Not provided') : null,
              position: schema === "Person" ? properties.position?.[0] || 'Not provided' : null,
              street: schema === "Organization" ? addressProperties.street?.[0] || 'Not provided' : null,
              postalCode: schema === "Organization" ? addressProperties.postalCode?.[0] || 'Not provided' : null,
              city: schema === "Organization" ? addressProperties.city?.[0] || 'Not provided' : null,
              sanctionsRegime: sanctionProps.program?.[0] || 'Not provided',
              listingDate: sanctionProps.listingDate?.[0] || 'Not provided',
              authority: sanctionProps.authority?.[0] || 'Not provided',
              first_seen: entry.first_seen || 'Not provided',
              last_seen: entry.last_seen || 'Not provided',
              sourceUrl: sanctionProps.sourceUrl?.[0] || 'Not provided'
            };
  
            this.targetCaptions.add(caption.toLocaleLowerCase());
            this.nameToInfo.set(caption.toLocaleLowerCase(), nameInfo);
          }
        } catch (e) {
          console.error('Error parsing JSON line:', e);
          console.error('Problematic entry:', line);
        }
      }
    } catch (error) {
      console.error('Error loading names:', error);
    }
  }
  
    findExactMatches(text) {
      const matches = [];
      const textLower = text.toLocaleLowerCase();
  
      for (const captionLower of this.targetCaptions) {
        let index = 0;
        while (true) {
          index = textLower.indexOf(captionLower, index);
          if (index === -1) break;
  
          const beforeChar = index === 0 ? ' ' : textLower[index - 1];
          const afterChar = index + captionLower.length >= textLower.length ? ' ' : textLower[index + captionLower.length];
  
          const isWordBoundary = char => /[\s.,!?;:"'()\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F]/.test(char);
  
          if (isWordBoundary(beforeChar) && isWordBoundary(afterChar)) {
            const info = this.nameToInfo.get(captionLower);
            matches.push({
              start: index,
              end: index + captionLower.length,
              caption: text.slice(index, index + captionLower.length),
              info: {
                ...info,
                caption: info.caption  // Ensure the original caption is passed through
              }
            });
            index += captionLower.length;
          } else {
            index += 1;
          }
        }
      }
  
      return matches.sort((a, b) => a.start - b.start);
    }
  
    createInfoPopup(info) {
        if (this.currentPopup) {
          this.currentPopup.remove();
        }
      
        const popup = document.createElement('div');
        popup.className = 'name-info-popup';
      
        const sourceUrl = info.sourceUrl !== 'Not provided' ? info.sourceUrl : '';
        const displayUrl = sourceUrl.includes('eur-lex.europa.eu') ? 'eur-lex.europa.eu' : 'Not provided';
        
        // Format the current date and time for the update timestamp
        const now = new Date();
        const timestampStr = now.toISOString().replace('T', ' ').slice(0, 19);
        
        const content = document.createElement('div');
        content.innerHTML = `
          <div style="background-color: #0000ff; color: white; padding: 12px 36px 12px 12px; margin: -12px -12px 12px -12px; border-radius: 8px 8px 0 0; position: relative;">
            <strong>${info.caption}</strong> is subject to sanctions by the European Union.
            <button class="close-button" style="position: absolute; top: 8px; right: 8px; color: white;">×</button>
          </div>
          ${info.otherNames.length > 0 ? `<div class="info-row"><span class="label">Other names</span> ${info.otherNames.join(', ')}</div>` : ''}
          ${info.schema === "Person" ? `
            <div class="info-row"><span class="label">Birth date</span> ${info.birthDate}</div>
            <div class="info-row"><span class="label">Gender</span> ${info.gender}</div>
            <div class="info-row"><span class="label">Position</span> ${info.position}</div>
          ` : `
            <div class="info-row"><span class="label">Street</span> ${info.street}</div>
            <div class="info-row"><span class="label">Postal Code</span> ${info.postalCode}</div>
            <div class="info-row"><span class="label">City</span> ${info.city}</div>
          `}
          <div class="info-row"><span class="label">Regime</span> ${info.sanctionsRegime}</div>
          <div class="info-row"><span class="label">Listing date</span> ${info.listingDate}</div>
          <div class="info-row"><span class="label">Authority</span> ${info.authority}</div>
          <div class="info-row"><span class="label">First seen</span> ${info.first_seen}</div>
          <div class="info-row"><span class="label">Last seen</span> ${info.last_seen}</div>
          ${sourceUrl ? 
            `<div class="info-row"><span class="label">Source</span> <a href="${sourceUrl}" target="_blank" style="color: #0000ff !important" class="url">${displayUrl}</a></div>` : 
            '<div class="info-row"><span class="label">Source</span> Not provided</div>'}
            <div style="margin-top: 12px; font-size: 12px; color: #666;">Data from <a href="https://www.opensanctions.org/datasets/eu_fsf/" target="_blank" style="color: #0000ff !important"</a>OpenSanctions</div>
        `;
      
        popup.appendChild(content);
        document.body.appendChild(popup);
      
        // Center the popup using fixed positioning
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.zIndex = '10000';
      
        // Add event listener to close button
        const closeButton = popup.querySelector('.close-button');
        closeButton.onclick = () => {
          popup.classList.remove('visible');
          setTimeout(() => {
            popup.remove();
            this.currentPopup = null;
          }, 200);
        };
      
        requestAnimationFrame(() => {
          popup.classList.add('visible');
        });
      
        this.currentPopup = popup;
        return popup;
      }
  
    processTextNode(node) {
      if (!node || !node.textContent || this.firstMatchHighlighted) return;
  
      const text = node.textContent;
      const matches = this.findExactMatches(text);
  
      if (matches.length === 0) return;
  
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
  
      matches.forEach(match => {
        if (this.firstMatchHighlighted) return;
  
        if (match.start > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.start)));
        }
  
        const mark = document.createElement('mark');
        mark.style.backgroundColor = '#fbf0ce';
        mark.style.border = '1px solid #fbf0ce#f7e19c';
        mark.style.color = 'black';
        mark.style.cursor = 'pointer';
        mark.textContent = match.caption;
        mark.dataset.caption = match.caption;
  
        // Updated click handler to create and position the popup
        mark.addEventListener('click', (e) => {
          e.stopPropagation();
          this.popupInfo = match.info;
          // Create popup at click coordinates
          this.createInfoPopup(match.info, e.clientX, e.clientY);
        });
  
        fragment.appendChild(mark);
        lastIndex = match.end;
        this.firstMatchHighlighted = true;
      });
  
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
  
      if (node.parentNode) {
        node.parentNode.replaceChild(fragment, node);
      }
    }
  
    processNode(node) {
      if (!node) return;
  
      if (node.nodeType === Node.TEXT_NODE) {
        this.processTextNode(node);
        return;
      }
  
      if (node.nodeType !== Node.ELEMENT_NODE) return;
  
      const skipTags = new Set(['SCRIPT', 'STYLE', 'MARK', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);
      if (skipTags.has(node.tagName)) return;
  
      Array.from(node.childNodes).forEach(child => this.processNode(child));
    }
  
    processPage() {
      if (this.isProcessing) return;
      this.isProcessing = true;
  
      try {
        this.firstMatchHighlighted = false; // Reset flag before processing
        this.processNode(document.body);
      } catch (error) {
        console.error('Error processing page:', error);
      } finally {
        this.isProcessing = false;
      }
    }
  
    setupObserver() {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && !node.closest('.name-info-popup')) {
              this.processNode(node);
            }
          });
        });
      });
  
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
  
  const highlighter = new NameHighlighter();
  highlighter.initialize();