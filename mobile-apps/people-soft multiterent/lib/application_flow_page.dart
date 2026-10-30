import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:hrmappfrontend/intern/form_one.dart';
import 'package:hrmappfrontend/Employee/employee_formone.dart';
import 'package:hrmappfrontend/port.dart';
import 'package:hrmappfrontend/auth_client.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApplicationFlowPage extends StatefulWidget {
  final String? initialCompanyCode;
  final String? initialRole;
  final String? initialType;

  const ApplicationFlowPage({
    super.key,
    this.initialCompanyCode,
    this.initialRole,
    this.initialType,
  });

  @override
  State<ApplicationFlowPage> createState() => _ApplicationFlowPageState();
}

class _ApplicationFlowPageState extends State<ApplicationFlowPage> {
  final PageController _pageController = PageController();
  int _currentStep = 0; // 0: Role & Track, 1: Job Details (if JD exists)

  // ── Company Data (Hardcoded to SOFTRATE) ──────────────────────────────────
  final TextEditingController _codeController = TextEditingController(text: 'SOFTRATE');
  bool _isVerifying = false;
  String _companyName = 'Softrate Technologies Private Limited – India';
  Map<String, dynamic>? _companySettings;
  String? _errorText;

  // ── Role & Opportunity Selection ──────────────────────────────────────────
  String _selectedRoleName = '';
  final TextEditingController _otherRoleCtrl = TextEditingController();
  String? _selectedRoleKey;
  String? _selectedRoleTitle;
  dynamic _selectedPosting;
  String? _selectedWalkinDriveId;
  bool _isSeasonalSelected = false;
  String? _selectedSeasonalTitle;
  List<dynamic> _walkinDrives = [];
  bool _isLoadingDrives = false;
  String _selectedTrack = 'Employee'; // 'Employee' or 'Internship'

  bool get _isRoleBothEnabled {
    final roleName = _selectedRoleTitle ?? _selectedRoleName.trim();
    if (roleName.isEmpty || _companySettings == null) return false;
    return _checkRoleIsEmployee(roleName) && _checkRoleIsIntern(roleName);
  }

  bool _checkRoleIsEmployee(String roleName) {
    if (_companySettings == null) return true;
    final List<dynamic> roles = _companySettings!['roles'] ?? [];
    final cleanRole = roleName.trim().toLowerCase();
    for (var r in roles) {
      if ((r['name'] ?? '').toString().trim().toLowerCase() == cleanRole) {
        return r['isEmployee'] == true;
      }
    }
    final List<dynamic> empList = _companySettings!['employeeRoles'] ?? [];
    if (empList.any((r) => r.toString().trim().toLowerCase() == cleanRole)) {
      return true;
    }
    final List<dynamic> intList = _companySettings!['internRoles'] ?? [];
    return !intList.any((r) => r.toString().trim().toLowerCase() == cleanRole);
  }

  bool _checkRoleIsIntern(String roleName) {
    if (_companySettings == null) return false;
    final List<dynamic> roles = _companySettings!['roles'] ?? [];
    final cleanRole = roleName.trim().toLowerCase();
    for (var r in roles) {
      if ((r['name'] ?? '').toString().trim().toLowerCase() == cleanRole) {
        return r['isIntern'] == true;
      }
    }
    final List<dynamic> intList = _companySettings!['internRoles'] ?? [];
    return intList.any((r) => r.toString().trim().toLowerCase() == cleanRole);
  }

  // ── Job Description (JD) ──────────────────────────────────────────────────
  Map<String, dynamic>? _matchingPosting;

  final Color _primaryColor = const Color(0xFF00657F);
  final String _baseUrl = getBaseUrl();

  @override
  void initState() {
    super.initState();
    if (widget.initialCompanyCode != null && widget.initialCompanyCode!.isNotEmpty) {
      _codeController.text = widget.initialCompanyCode!.toUpperCase();
    }
    _verifyCompany(auto: true);
  }

  @override
  void dispose() {
    _pageController.dispose();
    _codeController.dispose();
    _otherRoleCtrl.dispose();
    super.dispose();
  }

  // ── Verification & Roles ──────────────────────────────────────────────────
  Future<void> _verifyCompany({bool auto = false}) async {
    final code = _codeController.text.trim();
    if (code.isEmpty) return;

    setState(() {
      _isVerifying = true;
      _errorText = null;
    });

    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/api/onboarding/verify/$code'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('cached_company_code', code);

        if (mounted) {
          setState(() {
            _companyName = data['company']?['name'] ?? 'Softrate Technologies';
            _companySettings = data['company']?['settings'];
          });

          _fetchWalkinDrives(code);
          _setupAvailableRoles();
        }
      } else {
        if (!mounted) return;
        setState(() {
          _errorText = "Could not load company roles";
        });
      }
    } catch (e) {
      debugPrint("Verify error: $e");
      if (mounted) {
        setState(() {
          _errorText = "Could not load company roles. Check your network.";
        });
      }
    } finally {
      if (mounted) setState(() => _isVerifying = false);
    }
  }

  Future<void> _fetchWalkinDrives(String code) async {
    setState(() => _isLoadingDrives = true);
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/api/public/walkin-drives?companyCode=$code'),
        bypassCache: true,
      );
      if (response.statusCode == 200) {
        if (mounted) {
          setState(() {
            _walkinDrives = jsonDecode(response.body);
          });
        }
      }
    } catch (e) {
      debugPrint('Error fetching walkin drives: $e');
    } finally {
      if (mounted) setState(() => _isLoadingDrives = false);
    }
  }

  void _setupAvailableRoles() {
    if (widget.initialRole != null && widget.initialRole!.isNotEmpty) {
      final roleTitle = widget.initialRole!;
      setState(() {
        _selectedRoleKey = 'role_$roleTitle';
        _selectedRoleTitle = roleTitle;
        _selectedRoleName = roleTitle;
      });
      _checkMatchingJd();
    }
  }

  void _checkMatchingJd() {
    final roleName = _selectedRoleTitle ?? _selectedRoleName.trim();
    if (roleName.isEmpty || _companySettings == null) {
      _matchingPosting = null;
      return;
    }

    final List<dynamic> postings = _companySettings!['careerPostings'] ?? [];
    final cleanRole = roleName.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

    dynamic found;
    for (var p in postings) {
      final title = (p['title'] ?? '').toString().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
      if (title == cleanRole) {
        found = p;
        break;
      }
    }

    setState(() {
      _matchingPosting = found;
    });
  }

  List<dynamic> get _displayRoles {
    final List<dynamic> postings = _companySettings?['careerPostings'] ?? [];
    final listed = postings.where((p) => p['isListed'] == true || p['is_important'] == true).toList();
    if (listed.isNotEmpty) return listed;
    if (postings.isNotEmpty) return postings;
    final List<dynamic> internList = _companySettings?['internRoles'] ?? [];
    final List<dynamic> empList = _companySettings?['employeeRoles'] ?? [];
    final Set<String> unique = {};
    for (var r in [...internList, ...empList]) {
      final s = r.toString().trim();
      if (s.isNotEmpty && s.toLowerCase() != 'other') unique.add(s);
    }
    return unique.map((title) => {'title': title, 'isListed': true}).toList();
  }

  bool get canProceed {
    if (_isVerifying) return false;
    if (_selectedRoleKey == null) return false;
    if (_selectedRoleKey == 'other' && _otherRoleCtrl.text.trim().isEmpty) return false;
    return true;
  }

  void _nextPage() {
    if (!canProceed) {
      if (_selectedRoleKey == null) {
        setState(() => _errorText = 'Please select an opportunity or role before continuing.');
      } else if (_selectedRoleKey == 'other' && _otherRoleCtrl.text.trim().isEmpty) {
        setState(() => _errorText = 'Please enter your custom role name.');
      }
      return;
    }

    setState(() => _errorText = null);

    if (_currentStep == 0 && _matchingPosting != null && !_isSeasonalSelected) {
      // Advance to JD preview
      _pageController.nextPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
      setState(() => _currentStep = 1);
      return;
    }

    if (_currentStep == 1 && _isRoleBothEnabled) {
      // Advance from JD preview to Track selection
      _pageController.nextPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
      setState(() => _currentStep = 2);
      return;
    }

    // Final navigation to candidate details form
    final finalRole = _selectedRoleKey == 'other' ? _otherRoleCtrl.text.trim() : (_selectedRoleTitle ?? _selectedRoleName.trim());
    final companyCode = _codeController.text.trim().isNotEmpty ? _codeController.text.trim() : 'SOFTRATE';

    HapticFeedback.lightImpact();

    if (_isSeasonalSelected || _selectedWalkinDriveId != null) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => FormOne(
            companyCode: companyCode,
            companyName: _companyName,
            walkinDriveId: _selectedWalkinDriveId,
            isSeasonal: _isSeasonalSelected,
            seasonalTitle: _selectedSeasonalTitle,
            role: _isSeasonalSelected ? null : (finalRole.isNotEmpty ? finalRole : null),
            assessment: _isSeasonalSelected ? null : _selectedPosting?['assessment'],
          ),
        ),
      );
    } else {
      // Check whether role track is employee or intern
      final bool isEmployee;
      if (_isRoleBothEnabled) {
        isEmployee = _selectedTrack == 'Employee';
      } else {
        isEmployee = _checkRoleIsEmployee(finalRole);
      }

      if (isEmployee) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => EmployeeFormOne(
              companyCode: companyCode,
              companyName: _companyName,
              role: finalRole,
              assessment: _selectedPosting?['assessment'] ?? _matchingPosting?['assessment'],
            ),
          ),
        );
      } else {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => FormOne(
              companyCode: companyCode,
              companyName: _companyName,
              role: finalRole,
              assessment: _selectedPosting?['assessment'] ?? _matchingPosting?['assessment'],
            ),
          ),
        );
      }
    }
  }

  void _onBack() {
    if (_currentStep > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
      setState(() => _currentStep--);
    } else {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final bool hasJd = _matchingPosting != null;

    return Scaffold(
      floatingActionButton: canProceed
          ? FloatingActionButton.extended(
              onPressed: _nextPage,
              backgroundColor: _primaryColor,
              foregroundColor: Colors.white,
              elevation: 4,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              icon: Icon(
                _currentStep == 0 && hasJd ? Icons.description_outlined : Icons.arrow_forward_rounded,
                size: 20,
              ),
              label: Text(
                _currentStep == 0 && hasJd ? 'View Job Details' : 'Continue',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              ),
            )
          : null,
      body: Stack(
        children: [
          // Gradient background like sign-in page
          Container(
            width: size.width,
            height: size.height,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Color(0xFFFFA726), // orange
                  Color(0xFF8ED1DC), // light teal
                  Color(0xFF00657F), // dark teal
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
          ),

          SafeArea(
            bottom: false,
            child: Column(
              children: [
                // ── Header ──────────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 24, 10, 0),
                  child: Row(
                    children: [
                      IconButton(
                        icon: _buildIcon(
                          HugeIcons.strokeRoundedArrowLeft01,
                          color: Colors.white,
                          size: 24,
                        ),
                        onPressed: _onBack,
                      ),
                      Expanded(
                        child: Center(
                          child: Text(
                            _currentStep == 0 ? "Select Role & Track" : "Job Details",
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 19,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 48),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    _currentStep == 0
                        ? 'Applying to $_companyName'
                        : (_matchingPosting?['title'] ?? 'Role Overview'),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: 13,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
                const SizedBox(height: 32),

                // ── Form Card with curved borders ───────────────────────────
                Expanded(
                  child: Container(
                    width: double.infinity,
                    decoration: const BoxDecoration(
                      color: Color(0xFFF5F1ED),
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(30),
                      ),
                    ),
                    child: Column(
                      children: [
                        Expanded(
                          child: PageView(
                            controller: _pageController,
                            physics: const NeverScrollableScrollPhysics(),
                            children: [
                              _buildRoleAndTrackStep(),
                              if (hasJd) _buildJobDescriptionStep(),
                              if (hasJd && _isRoleBothEnabled) _buildTrackSelectionStep(),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Stepper Helper ────────────────────────────────────────────────────────
  Widget _buildMncStepper() {
    final bool hasJd = _matchingPosting != null && !_isSeasonalSelected && _selectedWalkinDriveId == null;
    final bool hasTrackStep = hasJd && _isRoleBothEnabled;
    return Row(
      children: [
        _buildMncStep(1, "Role", _currentStep == 0, _currentStep > 0 || canProceed),
        _buildMncDivider(_currentStep > 0),
        if (hasJd) ...[
          _buildMncStep(2, "Details", _currentStep == 1, _currentStep > 1),
          _buildMncDivider(_currentStep > 1),
        ],
        if (hasTrackStep) ...[
          _buildMncStep(3, "Track", _currentStep == 2, _currentStep > 2),
          _buildMncDivider(_currentStep > 2),
        ],
        _buildMncStep(hasJd ? (hasTrackStep ? 4 : 3) : 2, "Form", false, false),
      ],
    );
  }

  Widget _buildMncStep(int num, String label, bool isActive, bool isCompleted) {
    return SizedBox(
      width: 70,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: isCompleted
                  ? const Color.fromARGB(255, 49, 110, 51)
                  : (isActive ? _primaryColor : Colors.white),
              shape: BoxShape.circle,
              border: Border.all(
                color: isCompleted
                    ? const Color.fromARGB(255, 49, 110, 51)
                    : (isActive ? _primaryColor : Colors.grey.shade300),
                width: 1.5,
              ),
            ),
            child: Center(
              child: isCompleted
                  ? const Icon(Icons.check, color: Colors.white, size: 16)
                  : Text(
                      num.toString(),
                      style: TextStyle(
                        color: isActive ? Colors.white : Colors.grey.shade400,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.visible,
            style: TextStyle(
              fontSize: 10,
              color: isCompleted
                  ? const Color.fromARGB(255, 49, 110, 51)
                  : (isActive ? _primaryColor : Colors.grey.shade400),
              fontWeight: (isActive || isCompleted) ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMncDivider(bool isCompleted) {
    return Expanded(
      child: Container(
        height: 2,
        margin: const EdgeInsets.only(bottom: 20, left: 4, right: 4),
        decoration: BoxDecoration(
          color: isCompleted ? const Color.fromARGB(255, 49, 110, 51) : Colors.grey.shade300,
          borderRadius: BorderRadius.circular(1),
        ),
      ),
    );
  }

  // ── Step 0: Role & Track ──────────────────────────────────────────────────
  Widget _buildRoleAndTrackStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          _buildMncStepper(),
          const SizedBox(height: 28),

          const Text(
            "Select Opportunity or Role",
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1A1A1A),
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "Select an open drive or role you wish to apply for at $_companyName.",
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 20),

          if (_isVerifying || _isLoadingDrives)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: CircularProgressIndicator(
                  color: _primaryColor,
                  strokeWidth: 3,
                ),
              ),
            )
          else ...[
            // 1. Seasonal Internship Drives (e.g. Winter Internship 2026) - First Card
            ..._walkinDrives.where((d) => d['driveType'] == 'seasonal').map((drive) {
              final title = drive['title'] ?? 'Winter Internship';
              final driveId = drive['_id'] ?? 'drive';
              final roleKey = 'seasonal_$driveId';
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _buildRoleCard(
                  title: title,
                  subtitle: "",
                  role: roleKey,
                  icon: HugeIcons.strokeRoundedWork,
                  onTapOverride: () => setState(() {
                    _selectedRoleKey = roleKey;
                    _selectedRoleTitle = title;
                    _selectedRoleName = title;
                    _selectedWalkinDriveId = driveId;
                    _isSeasonalSelected = true;
                    _selectedSeasonalTitle = title;
                    _selectedPosting = null;
                    _checkMatchingJd();
                  }),
                ),
              );
            }),

            // 2. Walk-in Drives
            ..._walkinDrives.where((d) => d['driveType'] != 'seasonal').map((drive) {
              final endDate = drive['endDate'] != null ? drive['endDate'].toString().substring(0, 10) : '';
              final endTime = drive['endTime'] ?? '';
              final driveId = drive['_id'] ?? 'walkin';
              final roleKey = 'walkin_$driveId';
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _buildRoleCard(
                  title: "Walk-in Drive",
                  subtitle: endDate.isNotEmpty ? "Ends: $endDate at $endTime" : "Apply for walk-in drive opportunities",
                  role: roleKey,
                  icon: HugeIcons.strokeRoundedWork,
                  onTapOverride: () => setState(() {
                    _selectedRoleKey = roleKey;
                    _selectedRoleTitle = "Walk-in Drive";
                    _selectedRoleName = "Walk-in Drive";
                    _selectedWalkinDriveId = driveId;
                    _isSeasonalSelected = false;
                    _selectedSeasonalTitle = null;
                    _selectedPosting = null;
                    _checkMatchingJd();
                  }),
                ),
              );
            }),

            // 3. Published Roles from career postings
            ..._displayRoles.map((posting) {
              final title = (posting['title'] ?? '').toString();
              final dept = posting['department'] ?? posting['categoryName'] ?? '';
              final workType = posting['workType'] ?? '';
              final subtitle = [dept, workType].where((s) => s.toString().isNotEmpty).join(' • ');
              final roleKey = 'role_$title';

              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _buildRoleCard(
                  title: title,
                  subtitle: subtitle.isNotEmpty ? subtitle : "Apply for this open position",
                  role: roleKey,
                  icon: HugeIcons.strokeRoundedWork,
                  onTapOverride: () => setState(() {
                    _selectedRoleKey = roleKey;
                    _selectedRoleTitle = title;
                    _selectedRoleName = title;
                    _selectedWalkinDriveId = null;
                    _isSeasonalSelected = false;
                    _selectedSeasonalTitle = null;
                    _selectedPosting = posting;
                    if (_checkRoleIsEmployee(title)) {
                      _selectedTrack = 'Employee';
                    } else {
                      _selectedTrack = 'Internship';
                    }
                    _checkMatchingJd();
                  }),
                ),
              );
            }),

          ],

          if (_errorText != null) ...[
            const SizedBox(height: 16),
            Center(
              child: TextButton.icon(
                onPressed: () => _verifyCompany(),
                icon: const Icon(Icons.refresh_rounded, size: 16, color: Color(0xFF64748B)),
                label: const Text(
                  "Tap to reload opportunities",
                  style: TextStyle(color: Color(0xFF64748B), fontSize: 13, fontWeight: FontWeight.w500),
                ),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  backgroundColor: const Color(0xFFF1F5F9),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                ),
              ),
            ),
          ],

          const SizedBox(height: 80),
        ],
      ),
    );
  }

  // ── Step 1: Job Description (JD) Preview ──────────────────────────────────
  Widget _buildJobDescriptionStep() {
    final posting = _matchingPosting ?? {};
    final title = posting['title'] ?? 'Role Details';
    final workType = posting['workType'] ?? 'Full-Time';
    final location = posting['location'] ?? '';
    final department = posting['department'] ?? '';
    final about = posting['shortSummary'] ?? posting['about'] ?? '';
    final List<dynamic> responsibilities = posting['responsibilities'] ?? [];
    final List<dynamic> requirements = posting['requirements'] ?? [];

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          _buildMncStepper(),
          const SizedBox(height: 28),

          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.grey.shade200),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.02),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF00657F).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        workType,
                        style: const TextStyle(
                          color: Color(0xFF00657F),
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    if (location.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          location,
                          style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                if (department.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Department: $department',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                  ),
                ],
                const Divider(height: 28),

                if (about.isNotEmpty) ...[
                  const Text('About the Role', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 6),
                  Text(
                    about,
                    style: TextStyle(color: Colors.grey.shade700, fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 16),
                ],

                if (responsibilities.isNotEmpty) ...[
                  const Text('Key Responsibilities', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 6),
                  ...responsibilities.map((r) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('• ', style: TextStyle(fontWeight: FontWeight.bold)),
                            Expanded(
                              child: Text(
                                r.toString(),
                                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      )),
                  const SizedBox(height: 16),
                ],

                if (requirements.isNotEmpty) ...[
                  const Text('Requirements', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 6),
                  ...requirements.map((r) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('• ', style: TextStyle(fontWeight: FontWeight.bold)),
                            Expanded(
                              child: Text(
                                r.toString(),
                                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      )),
                ],
              ],
            ),
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  // ── Step 2: Track Selection (when both Employee & Intern are enabled) ───────
  Widget _buildTrackSelectionStep() {
    final roleName = _selectedRoleTitle ?? _selectedRoleName.trim();
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          _buildMncStepper(),
          const SizedBox(height: 28),

          const Text(
            "Select Application Track",
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1A1A1A),
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "Choose whether you are applying for Full-Time Employee or an Internship for $roleName.",
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 24),

          // Option 1: Full-Time Employee
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _buildRoleCard(
              title: "Full-Time Employee",
              subtitle: "Direct full-time employment with company salary & benefits",
              role: "track_employee",
              icon: HugeIcons.strokeRoundedWork,
              isSelectedOverride: _selectedTrack == 'Employee',
              onTapOverride: () => setState(() => _selectedTrack = 'Employee'),
            ),
          ),

          // Option 2: Internship
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _buildRoleCard(
              title: "Internship",
              subtitle: "Internship program with practical project exposure & stipend",
              role: "track_internship",
              icon: Icons.school_outlined,
              isSelectedOverride: _selectedTrack == 'Internship',
              onTapOverride: () => setState(() => _selectedTrack = 'Internship'),
            ),
          ),

          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildRoleCard({
    required String title,
    required String subtitle,
    required String role,
    required dynamic icon,
    String? badgeText,
    Color? badgeColor,
    Color? badgeTextColor,
    VoidCallback? onTapOverride,
    bool? isSelectedOverride,
  }) {
    bool isSelected = isSelectedOverride ?? (_selectedRoleKey == role);
    return GestureDetector(
      onTap: onTapOverride ?? () => setState(() => _selectedRoleKey = role),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.white.withValues(alpha: 0.8),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? Colors.transparent : Colors.grey.shade300,
            width: 1,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: _primaryColor.withValues(alpha: 0.12),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isSelected ? _primaryColor : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(14),
              ),
              child: _buildIcon(
                icon,
                color: isSelected ? Colors.white : Colors.black54,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: isSelected ? _primaryColor : const Color(0xFF0F172A),
                          ),
                        ),
                      ),
                      if (badgeText != null && badgeText.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: badgeColor ?? const Color(0xFFE0F2FE),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            badgeText,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: badgeTextColor ?? const Color(0xFF0369A1),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (isSelected)
              Icon(Icons.check_circle_rounded, color: _primaryColor, size: 22)
            else
              Icon(Icons.radio_button_unchecked_rounded, color: Colors.grey.shade300, size: 22),
          ],
        ),
      ),
    );
  }

  Widget _buildIcon(dynamic icon, {Color? color, double size = 24}) {
    if (icon is IconData) {
      return Icon(icon, color: color, size: size);
    } else {
      return HugeIcon(icon: icon, color: color ?? Colors.black, size: size);
    }
  }
}
