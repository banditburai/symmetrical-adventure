// clerkUtils.ts

const CLERK_API_KEY = Deno.env.get('CLERK_API_KEY'); 
const API_URL = 'https://api.clerk.dev/v1'; 


export async function fetchClerkJWK(): Promise<CryptoKey> {
    
    const JWKS_URL = Deno.env.get('JWKS_URL');
    if (!JWKS_URL) {
        throw new Error('JWKS_URL is not set in the environment variables.');
      }
    const jwksResponse = await fetch(JWKS_URL);
    if (!jwksResponse.ok) {
        throw new Error(`Failed to fetch JWKS: ${jwksResponse.statusText}`);
      }
    const jwks = await jwksResponse.json();
    const jwk = jwks.keys[0]; // Assuming there's at least one key in the JWKS
    if (!jwk) {
        throw new Error('JWK not found in the JWKS response.');
      }
    // The importKey call depends on the specifics of the key, such as the algorithm
    return await crypto.subtle.importKey(
      "jwk",
      jwk, 
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" },
      },
      true,
      ["verify"],
    );
  }
  
// Fetch and store the public key upon the first import of this module.
// This will only run once per application lifecycle.
let _publicKey: CryptoKey | undefined;

export async function getPublicKey(): Promise<CryptoKey> {
  if (!_publicKey) {
    _publicKey = await fetchClerkJWK(); // Fetch and cache the key
  }
  return _publicKey;
}


// This function verifies the session by making a POST request to Clerk's verify endpoint
export async function verifyClerkSession(sessionToken: string) {
  const verifyUrl = `${API_URL}/sessions/${sessionToken}/verify`; 

  const response = await fetch(verifyUrl, {
    method: 'POST', // Use POST for the verification request
    headers: {
      'Authorization': `Bearer ${CLERK_API_KEY}`, 
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: sessionToken }), // Send the JWT in the request body
  });

  if (!response.ok) {
    // Error handling based on the status code
    const errorText = await response.text(); // Optionally capture the response body for detailed error messages
    switch (response.status) {
      case 400:
        throw new Error('The verification request was unsuccessful.');
      case 401:
        throw new Error('Authentication invalid - check your Clerk API key and token.');
      case 404:
        throw new Error('The session could not be found.');
      default:
        throw new Error(`An error occurred: ${errorText}`);
    }
  }

  const sessionDetails = await response.json();
  console.log(sessionDetails);
  return sessionDetails; // Return the verified session details
}
