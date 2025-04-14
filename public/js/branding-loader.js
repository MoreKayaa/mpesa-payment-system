async function loadBrandingForBusiness(businessId) {
    try {
      // Get business data from Firestore
      const businessDoc = await firebase.firestore()
        .collection('businesses')
        .doc(businessId)
        .get();
      
      if (!businessDoc.exists) {
        console.error('Business not found');
        return;
      }
      
      const business = businessDoc.data();
      
      // Create a style element
      const style = document.createElement('style');
      style.innerHTML = `
        :root {
          --primary-color: ${business.branding?.primaryColor || '#4f46e5'};
          --secondary-color: ${business.branding?.secondaryColor || '#3b82f6'};
          --font-family: ${business.branding?.fontFamily || 'Arial, sans-serif'};
        }
        
        body {
          font-family: var(--font-family);
        }
        
        .brand-primary {
          color: var(--primary-color);
        }
        
        .brand-primary-bg {
          background-color: var(--primary-color);
        }
        
        .brand-secondary {
          color: var(--secondary-color);
        }
        
        .brand-secondary-bg {
          background-color: var(--secondary-color);
        }
        
        /* CK Marketing branding - DO NOT MODIFY */
        .ck-footer {
          background-color: #1f2937;
          color: white;
          padding: 1rem 0;
          text-align: center;
        }
        
        .ck-branding {
          color: #818cf8;
          font-weight: bold;
        }
      `;
      
      // Add style to head
      document.head.appendChild(style);
      
      // Set logo if available
      if (business.branding?.logoUrl) {
        const logoElements = document.querySelectorAll('.business-logo');
        logoElements.forEach(el => {
          el.src = business.branding.logoUrl;
          el.alt = business.name;
        });
      }
      
      // Set business name
      const nameElements = document.querySelectorAll('.business-name');
      nameElements.forEach(el => {
        el.textContent = business.name;
      });
      
      return business;
    } catch (error) {
      console.error('Error loading branding:', error);
      return null;
    }
  }