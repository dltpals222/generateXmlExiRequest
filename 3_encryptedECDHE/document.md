## 7.9.2.5.2.1 Common requirements for contract certificate private key encryption/decryption mechanism for EVCC without TPM 2.0

### [V2G20-2491]Each  V2G  entity  shall  have  mechanisms  to  process  ECDHE  Key  exchange.  Public  parameters are derived from the public ECDSA or EdDSA parameters.

### [V2G20-2492] Additional  authenticated data  (AAD)  shall  be  calculated  by  concatenating  the  PCID  received/used  in  the  CertificateInstallationReq  message  with  capital  letters  and  digits  without  separators  (18  bytes),  followed  by  the  SKI  value  of  the  contract  certificate included in the CertificateInstallationRes encoded as a hexa-decimal string with capital letters and digits according to IETF RFC 5234 (16 bytes).

#### NOTE 1Refer to C.2 for further details of PCID.

#### NOTE 2Refer to Table B.9 and Table B.10 further details of SKI value of the contract certificate.

#### NOTE 3See Figure 16 for a pictorial reference.

## 7.9.2.5.2.2.1 Common requirements for encryption of 521-bit and 448-bit contract certificate private keys for EVCC without TPM 2.0[V2G20-2493] The private key corresponding to the contract certificate shall be transmitted only in encrypted format within SECP521_EncryptedPrivateKeyor X448_EncryptedPrivateKey element in the SignedInstallationData parameter of the CertificateInstallationRes message.

#### NOTE 1 SECP521_EncryptedPrivateKey is used when the contract certificate provided in SignedInstallationData is based on curve as defined by [V2G20-2674]. X448_EncryptedPrivateKey is used when the contract certificate provided in SignedInstallationData is based on curve as defined by [V2G20-2319]. 

#### NOTE 2 At the time of CertificateInstallationReq, if the SA intends to provide multiple different contract certificates based on different curves as defined by [V2G20-2674] and [V2G20-2319], the SA will need to send multiple different SignedInstallationData containers to the SECC and the EVCC can, at its/user’s discretion, utilize the looping mechanism for CertificateInstallationReq to get and install all different contract certificates. 

### [V2G20-2494] The sender shall ensure that the authenticated encryption function used to encrypt data produces an authentication tag (also known as "tag" for short) of 128 bits. Refer to 5.2.1.2 of NIST Special Publication 800-38D for further details.

### [V2G20-2495] When using 448-bit ephemeral public key in requirement [V2G20-2497], the sender shall not include any extra filler/padding bytes to reach DHPublicKey size of 133 bytes.

### [V2G20-2496] Once the sender sends the data to the certificate provisioning service (CPS) for verification and signature generation, the sender shall irretrievably erase/delete/destroy the contract certificate private key, ECDHE private key and the session key as generated in 7.9.2.5.4, and the ciphertext.

#### NOTE 3 This ensures that the contract certificate private key cannot be compromised through a compromised SA. It also ensures that the ECDHE private key or session key are not reused. It further ensures that the same ciphertext is not sent out again to the receiver.

#### NOTE 4 This requirement is simply referring to unencrypted contract certificate private keys, ciphertext, session keys, etc. It does not refer to the SignedInstallationData that the eMSP gets back from the CPS which includes the CPS certificates and the CPS signature on the entire data. It also does not refer to the ECDH public key that the eMSP sends to the EVCC in DHPublicKey parameter.

## 7.9.2.5.2.2.2 Encryption of 521-bit contract certificate private key for EVCC without TPM 2.0
### [V2G20-2497] The 521-bit private key corresponding to the contract certificate shall be encrypted by the sender (the SA (eMSP)) using the session key derived in the ECDHE protocol (see 7.9.2.5.4). The sender shall apply the algorithm AES-GCM-256 according to NIST Special Publication 800-38D  for  this  encryption.  Per  NIST  Special  Publication  800-38D, the private key shall be extended to 528 bits by padding 7 leading zero bits so that AES-GCM-256 can be applied. The Initialization Vector (IV) for this encryption shall be randomly generated before encryption and shall have a length of 96 bits with minimum  entropy  as  defined  by  the  implementer(s).  The  AAD  for  this  encryption  shall  be  calculated  according  to  [V2G20-2492].  The  encryption  shall  produce  the  528-bit long ciphertext (encrypted private key) and 128 bit long authentication tag ("  tag"   for short).

#### NOTE 1See Figure 17 for a pictorial reference.

#### NOTE 2Explicit padding is required by [V2G20-2497] since the 521-bit private key is not byte aligned.

#### NOTE 3  Refer to 7.3.7 for further details on random number generation.

### [V2G20-2498] The byte order of all input data elements for AES-GCM-256 encryption, as specified by [V2G20-2497], shall be big-endian. This includes leading zeros needed in any data element   to   reach   the   length   as   prescribed   by   [V2G20-2497]   or NIST   Special   Publication 800-38D. 

#### NOTE 4  Padding of the plain text (private key) is not required when its length is a multiple of the block size of the encryption algorithm used.

The  output  of  AES-GCM-256  encryption  will  be  the  ciphertext  and  the  authentication  tag.  The  528  bit  ciphertext contains the encrypted 521-bit contract certificate private key.

### [V2G20-2499] The IV (as defined by [V2G20-2497]) shall be transmitted in the 12 most significant bytes of the SECP521_EncryptedPrivateKey field. The ciphertext (encrypted private key)  of  66  bytes  shall  be  written  after  the  IV  in  the  SECP521_EncryptedPrivateKeyfield.  The  tag  (as  defined  by  [V2G20-2494])  shall  make  up  the  16  least  significant  bytes of the SECP521_EncryptedPrivateKey field.  

Figure 18 provides this structure in pictorial format.

## 7.9.2.5.2.2.3 Encryption of 448 bit contract certificate private key for EVCC without TPM 2.0

### [V2G20-2500] The 448 bit private key corresponding to the contract certificate shall be encrypted by the sender (the SA (eMSP)) using the same session key used to encrypt the 521 bit private  key  in  [V2G20-2497].   The  sender  shall  apply  the  algorithm  AES-GCM-256 according to NIST Special Publication 800-38D for this encryption. The initialization vector (IV)  for  this  encryption  shall  be  randomly  generated  before  encryption  and  shall   have   a   length   of   96   bits   with   minimum   entropy   as   defined   by   the   implementer(s).  The  AAD  for  this  encryption  shall be  calculated  according  to[V2G20-2492]. The encryption shall produce the 448 bit long ciphertext (encrypted private key) and 128 bit long authentication tag ("tag"   for short).

#### NOTE 1See Figure 19 for a pictorial reference.

#### NOTE 2 No explicit padding is required here since the 448-bit private key is byte aligned.

#### NOTE 3 Refer to 7.3.7 for further details on random number generation. Refer to 7.9.2.5.2.2.2 for further details of 521 bit contract certificate private key encryption.


Figure 19 — 448 bit contract certificate private key encryption

### [V2G20-2501] The byte order of all input data elements for AES-GCM-256 encryption, as specified by [V2G20-2500], shall be big-endian. This includes leading zeros needed in any data element   to   reach   the   length   as   prescribed   by   [V2G20-2500]   or NIST   Special   Publication 800-38D. 

#### NOTE 4  Padding of the plain text (private key) is not required when its length is a multiple of the block size of the encryption algorithm used.

The  output  of  AES-GCM-256  encryption  will  be  the  ciphertext  and  the  authentication  tag.  The  448 bit ciphertext is the encrypted contract certificate private key.

### [V2G20-2502] The IV (as defined by [V2G20-2497]) shall be transmitted in the 12 most significant bytes of the X448_EncryptedPrivateKey field. The ciphertext (encrypted private key) of 56 bytes shall be written after the IV in the X448_EncryptedPrivateKey field. The tag (as defined by [V2G20-2494]) shall make up the 16 least significant bytes of the X448_EncryptedPrivateKey  field. Figure 20  provides  this  structure  in  pictorial  format.

## 7.9.2.5.2.3.1 Common requirements for decryption of 521-bit and 448-bit contract certificate private keys for EVCC without TPM 2.0 

### [V2G20-2503]The receiver shall ensure that the authenticated decryption function used to decrypt data can take an authentication tag (also known as "tag"   for short) of 128 bits as the second input. Refer to 5.2.2 of NIST Special Publication 800-38D for further details.

### [V2G20-2504]If the decryption of either the 521-bit private key or 448-bit private key or both fails, the receiver shall reject the CertificateInstallationRes message as invalid.

#### NOTE NIST Special Publication 800-38D describes some of the decryption failures. The chosen AES-GCM-256 decryption implementation can describe further failure conditions and error codes.

## 7.9.2.5.2.3.2 Decryption of 521-bit contract certificate private key for EVCC without TPM 2.0

### [V2G20-2505]Upon reception of SECP521_EncryptedPrivateKey, the receiver (EVCC) shall decrypt the  contract  certificate  private  key  using  the  session  key  derived  in  the  ECDHE  protocol (see 7.9.2.5.4) and applying the algorithm AES-GCM-256 according to NIST Special Publication 800-38D. The IV shall be read from the 12 most significant bytes of  the  SECP521_EncryptedPrivateKey  field.  The  ciphertext  (encrypted  private  key)  shall  be  read  from  the  66  bytes  after  the  IV  in  the SECP521_EncryptedPrivateKeyfield.  The  AAD  for  this  decryption  shall  be  calculated  before  decryption  following  [V2G20-2492] and [V2G20-2494]. The authentication tag shall be read from the 16 least significant bytes of the SECP521_EncryptedPrivateKey field.

#### NOTE 1See Figure 21 for a pictorial reference of the decryption.

#### NOTE 2Refer to Figure 18 further details of the SECP521_EncryptedPrivateKey structure.

![Figure 21 — 521 bit contract certificate private key decryption overview](attachment:c5515e91-c5dd-459d-be91-a33e4bc92eab:image.png)

Figure 21 — 521 bit contract certificate private key decryption overview

When decrypting the data using AES-GCM-256, the order of data is important. The receiver should ensure that the input data to AES-GCM-256 decryption function/API follows NIST Special Publication 800-38D. Refer to Figure 22 for further details.

![Figure 22 — 521 bit contract certificate private key decryption](attachment:9d7bbf6e-66f9-4668-89f5-d40c63395178:image.png)

Figure 22 — 521 bit contract certificate private key decryption

### [V2G20-2678]The EVCC shall consider the CertificateInstalaltionRes as invalid if the decrypted data does not contain 7 zeros in the most significant 7 bits.

### [V2G20-2506]The EVCC shall use the 521 least significant bits of the decrypted data as the 521 bit contract certificate private key.

### [V2G20-2507]Upon receipt of a contract certificate, the EVCC shall verify that the 521 bit  private  key received with the certificate is a valid 521 bit private key for that certificate:  

- its value shall be strictly smaller than the order of the base point for secp521r1 curve;

**AND** 

- multiplication of the base point with this value shall generate a key matching the 521 bit public key of the contract certificate

## 7.9.2.5.2.3.3 Decryption of 448-bit contract certificate private key for EVCC without TPM 2.0

### [V2G20-2508]Upon reception of X448_EncryptedPrivateKey, the receiver (EVCC) shall decrypt the contract certificate private key using the same session key used to decrypt the 521-bit private key in [V2G20-2505] and applying the algorithm AES-GCM-256 according to NIST  Special  Publication  800-38D.  The  IV  shall  be  read  from  the  12 most significant  bytes  of  the  X448_EncryptedPrivateKey field. The ciphertext (encrypted private    key)    shall    be    read    from    the    56    bytes    after    the    IV    in    the    X448_EncryptedPrivateKey  field.  The  AAD  for  this  decryption  shall  be  calculated  before decryption following [V2G20-2492]. The authentication tag shall be read from the 16 least significant bytes of the X448_EncryptedPrivateKey field.

#### NOTE 1See Figure 23 for a pictorial reference of the decryption.

#### NOTE 2Refer to Figure 20 for further details of the X448_EncryptedPrivateKey structure.

#### NOTE 3 Refer to 7.9.2.5.2.3.2 for further details of 521 bit contract certificate private key decryption.

![Figure 23 — 448 bit contract certificate private key decryption overview](attachment:6ba1ed5a-2e45-4be8-af21-df3f31fa81a3:image.png)

Figure 23 — 448 bit contract certificate private key decryption overview

When decrypting the data using AES-GCM-256, the order of data is important. The receiver should ensure that the input data to AES-GCM-256 decryption function/API follows NIST Special Publication 800-38D. Refer to Figure 24 for further details.

![Figure 24 — 448 bit contract certificate private key decryption](attachment:72123b66-4498-466f-b392-8e121f1d8cf5:image.png)

Figure 24 — 448 bit contract certificate private key decryption

### [V2G20-2509]The  EVCC  shall  use  the  448  bit  decrypted  data  as  the  448 bit  contract  certificate  private key.

### [V2G20-2510]Upon receipt of a contract certificate, the EVCC shall verify that the 448 bit  private  key received with the certificate is a valid 448 bit private key for that certificate:  

- its  value  shall be  strictly  smaller  than  the  order  of  the  base  point  for  x448  curve;

**AND** 

- multiplication of the base point with this value shall generate a key matching the 448-bit public key of the contract certificate

## 7.9.2.5.3.3 Contract certificate private key encryption mechanism for EVCC with TPM

### [V2G20-2518]   In order to enable a direct import of the encrypted contract certificate private key into the EVCC’s  TPM,  the  contract  certificate  private  key  shall  be  encrypted  with  the  TPM  storage  key  of  the  EVCC's  TPM  from  the  OEM  provisioning  certificate  extension  (in  contrast  to  [V2G20-2529]  and [V2G20-2530]).  This  encryption  shall  comply  withISO/IEC 11889-1:2015,   23.3.2   and   only   use   the   outer duplication wrapper.   This   encryption shall use the values from Table 19 for the default ECC algorithm (see [V2G20-2674])or  a  separately  defined  TPM  key  profile  for  an  alternative  ECC  algorithm  (see [V2G20-2319]), whereby the contract certificate public key is inserted into the buffers of  the  contract  key  profile’s  "unique"  field.  If  a  policy  digest  is  provided  in  the  OEM  provisioning certificate of this EVCC, the value of the policy digest shall be included in the  encryption  of  the  contract  certificate  private  key  via  the  "authPolicy"  field  of  the  contract key profile.

#### NOTE 1The  high-level  overview  of  the  contract  certificate  private  key  encryption  for  direct  import  into  the  EVCC’s TPM is shown in Figure 26. 

#### NOTE 2The values from Table 19 are necessary to calculate the "Name" (see ISO/IEC 11889-1:2015,  Clause 16) of the asymmetric contract key in TPM 2.0 or when parameter selection is based on the "new parent" (in this context the new parent would be the storage key). Table 19 also shows the values for the key profile in the case that the OEM chooses to not seal the contract key to a policy, i.e. for the case that the optional policyDigest field of the custom TPM certificate extension in the OEM provisioning certificate is omitted.

### [V2G20-2519]   The  encryption,  as  specified  by  [V2G20-2518],  requires  the  generation  of  a  new  seed  (session key). The seed shall be generated using the method defined in 7.9.2.5.3., with the "TPM  storage  key"  from  the  OEM  provisioning  certificate  extension  used  as  static  public key for calculation of the session key as defined by [V2G20-2535]. Also refer to ISO/IEC 11889-3:2015, B.5.1 for further details with respect to TPM 2.0.  

#### NOTE 3 The seed is used to derive HMAC and encryption keys (see Figure 26).   

### [V2G20-2520]   The  ephemeral  public  key  of  the  eMSP  (SA)  shall  be  transmitted  using  the  method  defined in [V2G20-2489]. 

### [V2G20-2521]   The    encrypted    contract    certificate    private    key    shall    be    transmitted    within    TPM_EncryptedPrivateKey   in the   message   CertificateInstallationRes   if   the   private   contract  key  was  encrypted  with  the  public  storage  key  from  the  OEM  provisioning  certificate extension carrying TPM Information. The SA shall not add any padding to the encrypted key to increase its size to the maximum size of 206 bytes.

#### NOTE 4 At  the  time  of  CertificateInstallationReq,  if  the  SA  intends  to  provide  multiple  different  contract certificates  based  on  different  curves  as  defined  by  [V2G20-2674]  and [V2G20-2319],  the  SA  will  need  to  send  multiple different SignedInstallationData containers to the SECC and the EVCC can, at its/user’s discretion, utilize the looping mechanism for CertificateInstallationReq to get and install all different contract certificates.

![Figure 26 — Contract key encryption for direct import into EVCC’s TPM 2.0 (for (elliptic curve) EC P-521/secp521r1)](attachment:def689ae-9fd9-4395-a2be-69666adc5f14:image.png)

Figure 26 — Contract key encryption for direct import into EVCC’s TPM 2.0 (for (elliptic curve) EC P-521/secp521r1)

Key

1. This is the root certificate which the eMSP uses to derive the contract certificate. This root does not need to be present in the EVCC but the CPS needs to handle it according to well established guidelines. 
2. The signature of the CPS ensures that the data are authentic. 
3. Encrypted with AES in CFB mode based on ECDH shared secret with input from the TPM 2.0 TPM storage key (public key) coming from the OEM provisioning certificate and is additionally protected with an HMAC which binds the encrypted contract private key to the corresponding contract public key.

#### NOTE 5 Key  encryption  process  and  structures  illustrated  in  Figure  26  are  valid  for  both  currently  specified (elliptic curve) ECs. In case of the Ed448 curve, the length of the contract private key, encrypted TPM 2.0 contract private key and HMAC should be adjusted.

#### NOTE 6 The SA can either send secp521 (see [V2G20-2674]) or Curve448 (see [V2G20-2319]) based encrypted contract private key using the TPM_EncryptedPrivateKey parameter.

### [V2G20-2522] Once  the  sender  sends  the  data  to  the  certificate  provisioning  service  (CPS)  for  verification      and      signature      generation,      the      sender      shall      irretrievably erase/delete/destroy  the  contract  certificate  private  keys  (both  the  encrypted  and  unencrypted  format),  ECDHE  private  key  and  the  session  key  as  generated  in7.9.2.5.3. 

#### NOTE 7 This ensures that the contract certificate private key cannot be compromised through a compromised SA.  It  also  ensures  that  the  ECDHE  private  key  or  session  key  are  not  reused.  It  further  ensures  that  the  same  ciphertext is not sent out again to the receiver.

#### NOTE 8 This requirement is simply alluding to unencrypted contract certificate private keys, ciphertext, session keys, etc. It does not refer to the SignedInstallationData that the eMSP gets back from the CPS which includes the CPS certificates and the CPS signature on the entire data. It also does not refer to the ECDH public key that the eMSP sends to the EVCC in DHPublicKey parameter.